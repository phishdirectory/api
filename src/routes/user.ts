import disposableEmailDetector from "@jaspermayone/disposable-email-detector";
import bcrypt from "bcrypt";
import express from "express";

import { count, eq } from "drizzle-orm";
import { loginAttempts, requestsLog, users } from "src/db/schema";
import { LoginEmail } from "src/email/login";
import { WelcomeEmail } from "src/email/welcome";
import { hashData } from "src/func/hashData";
import { logRequest } from "src/middleware/logRequest";
import { db } from "src/utils/db";
import {
  authenticateToken,
  generateAccessToken,
  getUserInfo,
} from "src/utils/jwt";
import resend from "src/utils/resend";
import { userNeedsExtendedData } from "src/utils/userNeedsExtendedData";

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: false }));
router.use(logRequest);

/**
 * POST /user/signup
 * @summary Create a new user account
 * @tags User - User Management / Info and Authentication endpoints
 * @param {User} request.body.required - User signup information
 * @return {object} 200 - Success response with UUID
 * @return {object} 400 - Validation error
 * @produces application/json
 * @example request - Example signup request
 * {
 *   "name": "John Doe",
 *   "email": "john.doe@example.com",
 *   "password": "securepassword123",
 * }
 * @example response - 200 - Success response
 * {
 *   "message": "User created successfully, please login.",
 *   "uuid": "123e4567-e89b-12d3-a456-426614174000"
 * }
 */
router.post("/signup", async (req, res) => {
  // metrics.increment("endpoint.user.signup");
  const body = req.body;
  const { firstName, lastName, email, password, password_confirmation } = body;

  const requiredFields = {
    firstName: "First name is required",
    lastName: "Last name is required",
    email: "Email is required",
    password: "Password is required",
    password_confirmation: "Password confirmation is required",
  };

  for (const [field, errorMessage] of Object.entries(requiredFields)) {
    if (!req.body[field]) {
      return res.status(400).json(errorMessage);
    }
  }

  let isDisposable = await disposableEmailDetector(email as string);

  if (isDisposable) {
    res.status(400).json("Disposable email addresses are not allowed");
    return;
  }

  // use regex to validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json("Invalid email address");
  }

  // check if passwords match
  if (password !== password_confirmation) {
    return res.status(400).json("Passwords do not match");
  }

  // password must be 8 chars
  if (password.length < 8) {
    return res.status(400).json("Password must be at least 8 characters");
  }

  // do logic for checking if user exists by email, then create user if not
  try {
    const apiKey = process.env.INTERNAL_API_KEY; // Assuming you store the API key in environment variables
    const hashKey = process.env.INTERNAL_HASH_KEY; // Assuming you store the hash key in environment variables

    if (!apiKey) {
      console.error("API key is missing");
      return res.status(500).json("Server configuration error");
    }

    // Check if user exists
    const checkResponse = await fetch(
      `http://localhost:3000/api/v1/users/by_email?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        } as HeadersInit, // Type assertion to fix the error
      }
    );

    // If user exists (status 200), return error
    if (checkResponse.status === 200) {
      return res.status(400).json("User with this email already exists");
    }

    // If user not found (status 404), proceed with creation
    if (checkResponse.status === 404) {
      const errorData = await checkResponse.json();

      if (errorData.error === "User not found") {
        let unhashedData = {
          first_name: firstName,
          last_name: lastName,
          email: email,
          password: password,
          password_confirmation: password_confirmation,
        };
        const hashedData = await hashData(unhashedData, hashKey);

        // Create user
        const createResponse = await fetch(
          "http://localhost:3000/api/v1/users",
          {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            } as HeadersInit, // Type assertion to fix the error
            body: JSON.stringify({
              hashed_data: hashedData,
            }),
          }
        );

        if (createResponse.ok) {
          const newUserData = await createResponse.json();

          if (
            process.env.NODE_ENV === "production" ||
            process.env.SEND_DEV_EMAILS === "true"
          ) {
            // Send welcome email after user is created
            await resend.emails.send({
              from: "phish.directory <onboarding@transactional.phish.directory>",
              to: email,
              subject: "Welcome to Phish Directory",
              // @ts-expect-error
              react: WelcomeEmail({ firstName: firstName }),
            });

            // Send team notification email
            await resend.emails.send({
              from: "rbt [phish.directory] <bot@transactional.phish.directory>",
              to: "team@phish.directory",
              subject: "New User Signup",
              text: `New User Signup\n\nName: ${firstName} ${lastName}\nEmail: ${email}`,
              html: `<html><body><h1>New User Signup</h1><p>Name: ${firstName} ${lastName}</p><p>Email: ${email}</p></body></html>`,
            });
          }

          // Successful signup
          return res.status(201).json({
            message: "User created successfully",
            user: newUserData,
          });
        } else {
          // Handle user creation failure
          return res.status(500).json("Failed to create user");
        }
      }
    }

    // Handle other unexpected status codes
    return res.status(500).json("Unexpected error during user verification");
  } catch (error) {
    console.error("Error in signup process:", error);
    return res.status(500).json("Internal server error");
  }
});

/**
 * POST /user/login
 * @summary Authenticate user and get JWT token
 * @tags User - User Management / Info and Authentication endpoints
 * @param {object} request.body.required - User login credentials
 * @return {object} 200 - JWT token and user UUID
 * @return {object} 400 - Invalid credentials
 * @return {object} 403 - Account deleted
 * @produces application/json
 * @example request - Login request
 * {
 *   "email": "john.doe@example.com",
 *   "password": "securepassword123"
 * }
 * @example response - 200 - Successful login
 * {
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "uuid": "123e4567-e89b-12d3-a456-426614174000"
 * }
 */
router.post("/login", async (req, res) => {
  // metrics.increment("endpoint.user.login");

  let useExteded = await userNeedsExtendedData(req);

  const body = req.body;
  const { email, password } = body;

  if (!email || !password) {
    return res.status(400).json("Missing email or password");
  }

  // Get IP address from the request
  const ipAddress =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;

  // Get detailed IP information from ipgeolocation.io
  let ipInfo = {
    ip: ipAddress,
    timestamp: new Date().toISOString(),
    userAgent: req.headers["user-agent"] || "Unknown",
    country: null,
    city: null,
    region: null,
    location: null,
    isp: null,
    organization: null,
  };

  try {
    const API_KEY = process.env.IPGEOLOCATION_API_KEY; // Store your API key in environment variables
    const geoResponse = await fetch(
      `https://api.ipgeolocation.io/ipgeo?apiKey=${API_KEY}&ip=${ipAddress}`
    );

    if (geoResponse.ok) {
      const geoData = await geoResponse.json();

      // Update ipInfo with data from the API
      ipInfo = {
        ...ipInfo,
        country: geoData.country_name,
        countryCode: geoData.country_code2,
        city: geoData.city,
        region: geoData.state_prov,
        regionCode: geoData.state_code,
        zipcode: geoData.zipcode,
        // @ts-expect-error
        location: {
          lat: geoData.latitude,
          lng: geoData.longitude,
        },
        isp: geoData.isp,
        organization: geoData.organization,
        timezone: geoData.time_zone?.name,
        currency: geoData.currency?.code,
      };
    }
  } catch (error) {
    console.error("Failed to fetch IP geolocation data:", error);
    // Continue with basic IP info if geolocation lookup fails
  }

  const user = await db.query.users.findFirst({
    where: (users) => eq(users.email, email),
  });

  if (!user) {
    return res.status(400).json("Invalid email or password");
  }

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json("Invalid email or password");
  }

  if (user.deleted_at !== null) {
    return res
      .status(403)
      .json(
        "User has been deleted. Please contact support if you believe this is an error or need to reactivate your account."
      );
  }

  // Store login attempt with IP information
  await db.insert(loginAttempts).values({
    userId: user.id,
    ipAddress: ipAddress as string,
    userAgent: ipInfo.userAgent,
    success: true,
    ipInfo: ipInfo,
  });

  const token = await generateAccessToken(user);

  let jsonresponsebody = {};

  if (
    process.env.NODE_ENV === "production" ||
    process.env.SEND_DEV_EMAILS === "true"
  ) {
    // Update the email to include comprehensive IP address information

    await resend.emails.send({
      from: "phish.directory <security@transactional.phish.directory>",
      to: user.email,
      subject: "Phish Directory API Login",
      // @ts-expect-error
      react: LoginEmail({
        ipAddress: ipInfo.ip as string,
        timestamp: ipInfo.timestamp,
        userAgent: ipInfo.userAgent,
        userName: `${user.firstName} ${user.lastName}`,
      }),
    });
  }

  if (useExteded) {
    jsonresponsebody = {
      token: token,
      uuid: user.uuid,
    };
  } else {
    jsonresponsebody = {
      token: token,
    };
  }

  return res.status(200).json(jsonresponsebody);
});

/**
 * GET /user/me
 * @summary Get authenticated user profile and metrics
 * @tags User - User Management / Info and Authentication endpoints
 * @security BearerAuth
 * @return {object} 200 - User profile with usage metrics
 * @return {object} 400 - User not found
 * @produces application/json
 * @example response - 200 - Profile response
 * {
 *   "name": "John Doe",
 *   "email": "john.doe@example.com",
 *   "uuid": "123e4567-e89b-12d3-a456-426614174000",
 *   "permission": "basic",
 *   "accountType": "user",
 *   "metrics": {
 *     "requests": {
 *       "count": 3,
 *       "methods": [
 *         {
 *           "method": "GET",
 *           "count": 3
 *         }
 *       ],
 *       "urls": [
 *         {
 *           "url": "/user/me",
 *           "count": 2
 *         }
 *       ]
 *     }
 *   },
 *   "accountCreated": "2024-08-14T02:11:02.626Z"
 * }
 */
router.get("/me", authenticateToken, async (req, res) => {
  // metrics.increment("endpoint.user.me");

  const userInfo = await getUserInfo(req);

  if (!userInfo) {
    return res.status(400).json("User not found");
  }

  // Get the count of requests made by the user
  const requestcount = await db
    .select({ count: count() })
    .from(requestsLog)
    .where(eq(requestsLog.userId, userInfo!.id));

  // Fetch all requests made by the user
  const userRequests = await db
    .select()
    .from(requestsLog)
    .where(eq(requestsLog.userId, userInfo!.id));

  // Normalize the URLs by removing query parameters
  const normalizedRequests = userRequests.map((req) => {
    const urlWithoutQuery = req.url.split("?")[0]; // Remove query params
    return {
      ...req,
      url: urlWithoutQuery,
    };
  });

  // Group the requests by the normalized URL and count occurrences
  const requestCountsByUrl = normalizedRequests.reduce((acc, req) => {
    acc[req.url] = (acc[req.url] || 0) + 1;
    return acc;
  }, {});

  const requestUrls = Object.keys(requestCountsByUrl).map((url) => ({
    url,
    count: requestCountsByUrl[url],
  }));

  // Group by request method
  // Group by request method
  const groupByMethod = await db
    .select({
      method: requestsLog.method,
      count: count(),
    })
    .from(requestsLog)
    .where(eq(requestsLog.userId, userInfo!.id))
    .groupBy(requestsLog.method); // Missing GROUP BY clause

  // Transform the data to a more readable format
  const requestMethods = groupByMethod.map((methodGroup) => ({
    method: methodGroup.method,
    count: methodGroup.count,
  }));

  return res.status(200).json({
    name: userInfo.firstName + " " + userInfo.lastName,
    email: userInfo.email,
    uuid: userInfo.uuid,
    permission: userInfo.permissionLevel,
    extendedData: userInfo.useExtendedData,
    metrics: {
      requests: {
        count: requestcount[0].count,
        methods: requestMethods,
        urls: requestUrls,
      },
    },
    accountCreated: userInfo.created_at,
  });
});

/**
 * PATCH /user/me
 * @summary Update authenticated user profile
 * @description Update user details (name, password). Email updates require contacting support.
 * Only include fields that need updating. Password updates require current password verification.
 * @tags User - User Management / Info and Authentication endpoints
 * @security BearerAuth
 * @param {object} request.body - Fields to update
 * @param {string} [request.body.name] - New display name
 * @param {string} [request.body.password] - New password (requires verification)
 * @return {string} 200 - Update success message
 * @return {string} 400 - Update error message
 * @produces application/json
 * @example request - Name update
 * {
 *   "name": "John Smith"
 * }
 * @example request - Password update
 * {
 *   "password": "newSecurePassword123"
 * }
 * @example response - 200 - Success message
 * "User updated successfully"
 */
router.patch("/me", authenticateToken, async (req, res) => {
  // metrics.increment("endpoint.user.me.patch");

  const userInfo = await getUserInfo(req);

  if (!userInfo) {
    return res.status(400).json("User not found");
  }

  const { name, password } = req.body;

  if (!name && !password) {
    return res.status(400).json("No fields to update");
  }

  if (name) {
    await db
      .update(users)
      .set({
        firstName: name.split(" ")[0],
        lastName: name.split(" ").slice(1).join(" "),
      })
      .where(eq(users.id, userInfo.id));
  }

  if (password) {
    const valid = await bcrypt.compare(password, userInfo.password);
    if (!valid) {
      return res.status(400).json("Invalid password");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await db
      .update(users)
      .set({
        password: hashedPassword,
      })
      .where(eq(users.id, userInfo.id));
  }

  return res.status(200).json("User updated successfully");
});

export default router;

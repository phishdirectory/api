import { count, eq, gte, sql } from "drizzle-orm";
import express from "express";
import moment from "moment";
import {
  APIs,
  domains,
  permissionLevel,
  rawAPIData,
  requestsLog,
  users,
} from "src/db/schema";
import { getPackageVersion, getVersion } from "src/func/getVersion";
import { logRequest } from "src/middleware/logRequest";
import { db } from "src/utils/db";
import { authenticateToken, getUserInfo } from "src/utils/jwt";
import domainRouter from "./routes/domain";
import sinkingYachtsRouter from "./routes/sinking-yachts";
import userRouter from "./routes/user";
const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: false }));
router.use(authenticateToken);

// middleware to check if the user is an admin
router.use(async (req, res, next) => {
  let user = await getUserInfo(req);

  if (!user) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  if (user.permissionLevel < permissionLevel.enumValues[2]) {
    return res.status(403).json({
      error: "You do not have permission to access this endpoint",
    });
  } else {
    next();
  }
});

/**
 * GET /admin/metrics
 * @summary Get comprehensive system metrics
 * @description Provides detailed system information and metrics for administrators including:
 * - System status and environment details
 * - Runtime information (uptime, start time)
 * - Version information for API and all dependencies
 * - Usage statistics across different time periods
 * - API integration response counts
 * @tags Misc - Miscellaneous endpoints
 * @security BearerAuth
 * @return {object} 200 - Detailed metrics response
 * @return {object} 403 - Permission denied
 * @produces application/json
 * @example response - 200 - Complete metrics response
 * {
 *   "status": "up",
 *   "environment": "production",
 *   "uptime": "48:12:33",
 *   "dateStarted": "01-09-24 9:45:27 AM +00:00",
 *   "versions": {
 *     "api": "2.0.0",
 *     "node": "v18.17.0",
 *     "packages": {
 *       "express": "4.18.2",
 *       "drizzle": "0.19.0",
 *       "axios": "1.5.0",
 *       "cron": "2.4.3",
 *       "helmet": "7.0.0",
 *       "jsonwebtoken": "9.0.2"
 *     }
 *   },
 *   "counts": {
 *     "domains": 1234,
 *     "users": 567,
 *     "requests": {
 *       "lifetime": 50000,
 *       "today": 1500,
 *       "24 hours": 1800,
 *       "week": 12000,
 *       "month": 45000,
 *       "year": 500000
 *     },
 *     "responses": {
 *       "googleSafebrowsing": 45000,
 *       "ipQualityScore": 42000,
 *       "phishObserver": 35000,
 *       "phishReport": 30000,
 *       "securityTrails": 25000,
 *       "sinkingYahts": 20000,
 *       "urlScan": 15000,
 *       "virusTotal": 10000,
 *       "walshy": 5000
 *     }
 *   }
 * }
 * @example response - 403 - Permission denied
 * {
 *   "error": "You do not have permission to access this endpoint"
 * }
 */
router.get("/metrics", logRequest, async (req, res) => {
  // metrics.increment("endpoint.misc.metrics");

  // Record start time for ping calculation using high-precision timer
  const startTime = performance.now();
  // Check database connectivity with a simple query
  await db.execute(sql`SELECT 1`);
  // Calculate ping time with microsecond precision
  const pingTime = Math.round((performance.now() - startTime) * 100) / 100;

  // Get memory usage and convert to MB for readability
  const memoryUsage = process.memoryUsage();
  const formatMemory = (bytes: number) =>
    Math.round((bytes / 1024 / 1024) * 100) / 100;

  let uptime = process.uptime();
  let uptimeString = new Date(uptime * 1000).toISOString().substr(11, 8);
  let dateStarted = new Date(Date.now() - uptime * 1000);
  let dateStartedFormatted = moment(dateStarted).format("MM-DD-YY H:m:s A Z");

  let domainCount = await db.select({ count: count() }).from(domains);
  let userCount = await db.select({ count: count() }).from(users);
  let requestCount = await db.select({ count: count() }).from(requestsLog);

  let npmVersion = getVersion();
  let expressVersion = getPackageVersion("express");
  let drizzleKitVersion = getPackageVersion("drizzle-kit");
  let drizzleORMVersion = getPackageVersion("drizzle-orm");
  let axiosVersion = getPackageVersion("axios");
  let cronVersion = getPackageVersion("cron");
  let helmetVersion = getPackageVersion("helmet");
  let jsonwebtokenVersion = getPackageVersion("jsonwebtoken");
  let nodeVersion = process.version;

  let environment = process.env.NODE_ENV;

  return res.status(200).json({
    status: "up",
    environment: environment,
    uptime: uptimeString,
    dateStarted: dateStartedFormatted,
    memory: {
      rss: `${formatMemory(memoryUsage.rss)}MB`, // Resident Set Size - total memory allocated
      heapTotal: `${formatMemory(memoryUsage.heapTotal)}MB`, // V8 heap total size
      heapUsed: `${formatMemory(memoryUsage.heapUsed)}MB`, // V8 heap used size
      external: `${formatMemory(memoryUsage.external)}MB`, // C++ objects bound to JavaScript
      arrayBuffers: `${formatMemory(memoryUsage.arrayBuffers)}MB`, // Memory used by array buffers
    },
    database: {
      connected: true,
      ping: `${pingTime}ms`,
      lastError: null,
    },
    versions: {
      api: npmVersion,
      node: nodeVersion,
      packages: {
        express: expressVersion,
        drizzle: {
          kit: drizzleKitVersion,
          orm: drizzleORMVersion,
        },
        axios: axiosVersion,
        cron: cronVersion,
        helmet: helmetVersion,
        jsonwebtoken: jsonwebtokenVersion,
      },
    },
    counts: {
      domains: domainCount[0].count,
      users: userCount[0].count,
      requests: {
        lifetime: requestCount[0].count,
        "24 hours": (
          await db
            .select({ count: count() })
            .from(requestsLog)
            .where(
              gte(
                requestsLog.created_at,
                new Date(Date.now() - 24 * 60 * 60 * 1000)
              )
            )
        )[0].count,
        week: (
          await db
            .select({ count: count() })
            .from(requestsLog)
            .where(
              gte(
                requestsLog.created_at,
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              )
            )
        )[0].count,
        month: (
          await db
            .select({ count: count() })
            .from(requestsLog)
            .where(
              gte(
                requestsLog.created_at,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              )
            )
        )[0].count,
        year: (
          await db
            .select({ count: count() })
            .from(requestsLog)
            .where(
              gte(
                requestsLog.created_at,
                new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
              )
            )
        )[0].count,
      },
      responses: {
        googleSafebrowsing: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[0]))
        )[0].count,
        googleWebRisk: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[1]))
        )[0].count,
        ipQualityScore: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[2]))
        )[0].count,
        phishObserver: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[3]))
        )[0].count,
        phishReport: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[4]))
        )[0].count,
        securityTrails: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[5]))
        )[0].count,
        sinkingYahts: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[6]))
        )[0].count,
        urlScan: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[7]))
        )[0].count,
        virusTotal: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[8]))
        )[0].count,
        walshy: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[9]))
        )[0].count,
        ipQuery: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[10]))
        )[0].count,
        abuseCh: (
          await db
            .select({ count: count() })
            .from(rawAPIData)
            .where(eq(rawAPIData.sourceAPI, APIs.enumValues[11]))
        )[0].count,
      },
    },
  });
});

router.use("/domain", logRequest, domainRouter);
router.use("/sinking-yachts", logRequest, sinkingYachtsRouter);
router.use("/user", userRouter);

export default router;

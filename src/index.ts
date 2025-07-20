import cors from "cors";
import * as dotenv from "dotenv";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import expressJSDocSwagger from "express-jsdoc-swagger";
import helmet from "helmet";

import { app } from "./app";
import router from "./router";
import { server } from "./server";
// import metrics from "./metrics";
import { swaggerOptions as adminSwagOptions } from "./admin-routes/swaggerOptions";
import { swaggerOptions as mainSwagOptions } from "./swaggerOptions";
import { sinkingYahtsService } from "./services/_index";
import * as logger from "./utils/logger";
dotenv.config();

const port: number = Number(process.env.PORT) || 3000;

expressJSDocSwagger(app)(mainSwagOptions);
expressJSDocSwagger(app)(adminSwagOptions);

logger.database("Initializing database connection");
try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const db = drizzle(process.env.DATABASE_URL);
  logger.database("Database connection initialized successfully");
  
  // Initialize SinkingYachts realtime feed monitoring
  if (process.env.ENABLE_SINKING_YACHTS_FEED !== "false") {
    logger.info("Starting SinkingYachts realtime feed monitoring...");
    sinkingYahtsService.startFeedMonitoring(process.env.SKIP_BULK_IMPORT === "true")
      .then(() => {
        logger.info("SinkingYachts feed monitoring started successfully");
      })
      .catch((error) => {
        logger.error(`Failed to start SinkingYachts feed monitoring: ${error.message}`);
        // Don't exit the process, let the server continue without feed monitoring
      });
  } else {
    logger.info("SinkingYachts feed monitoring disabled by ENABLE_SINKING_YACHTS_FEED=false");
  }
} catch (error) {
  logger.error(
    `Failed to initialize database connection: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

let corsOptions: cors.CorsOptions;

if (process.env.NODE_ENV === "production") {
  corsOptions = {
    origin: ["https://dashboard.phish.directory"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Referrer", "Accept"], // Ensure 'Authorization' is included for token-based auth
    exposedHeaders: ["Authorization"], // Add this line
  };
} else {
  corsOptions = {
    origin: ["http://localhost:4000", "https://dashboard.phish.directory"],
    credentials: true, // This allows cookies/auth headers to be sent
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Referrer", "Accept"], // Ensure 'Authorization' is included for token-based auth
    exposedHeaders: ["Authorization"], // Add this line
  };
}

app.use(cors(corsOptions)); // Enable CORS for all routes

app.disable("x-powered-by");
app.use(
  helmet({
    xFrameOptions: { action: "deny" },
    xContentTypeOptions: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'", // Allow connections to the same origin
          // Allow connections to external APIs (if any)
          ...(process.env.NODE_ENV === "production"
            ? [
                "https://api.phish.directory",
                "https://dashboard.phish.directory",
              ]
            : ["http://localhost:4000", "http://localhost:3000"]), // Allow local development
        ],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
    },
    referrerPolicy: { policy: "strict-origin" },
    strictTransportSecurity: {
      maxAge: 63072000,
      preload: true,
    },
    xPoweredBy: false,
  })
);
app.use("/", router);

// Heartbeat
// new CronJob(
//   "0 * * * * *",
//   async function () {
//     logger.log("Thump Thump");
//     // metrics.increment("heartbeat");
//   },
//   null,
//   true,
//   "America/New_York",
// );
//

server
  .listen(Number(port), "0.0.0.0", () => {
    logger.info(`Server is running on port ${port}`);
  })
  .on("error", (err) => {
    logger.error(`Failed to start server: ${err.message}`);
  });

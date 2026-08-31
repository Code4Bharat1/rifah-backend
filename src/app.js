import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import morgan from "morgan";
import { env } from "./config/env.js";
import { corsConfig } from "./config/cors.js";
import { securityConfig } from "./config/security.js";
import { requestLogger } from "./infrastructure/logger/request-logger.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import { apiRouter } from "./routes/index.js";
import { healthRoutes } from "./routes/health.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security HTTP headers
app.use(helmet(securityConfig.helmet));

// Enable CORS
app.use(cors(corsConfig));

// Request compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// HTTP Request logging with Morgan
app.use(morgan(env.isDevelopment() ? "dev" : "combined"));

// Global rate limiting
app.use(rateLimitMiddleware);

// Serve uploaded files statically from local server filesystem
const uploadsPath = path.resolve(__dirname, `../${env.STORAGE.UPLOAD_DIR}`);
app.use(`/${env.STORAGE.UPLOAD_DIR}`, express.static(uploadsPath));

// Health check endpoint (root level)
app.use("/health", healthRoutes);

// Mount API v1 Routes
app.use(env.API_PREFIX, apiRouter);

// 404 Route Not Found Handler
app.use(notFoundMiddleware);

// Centralized Error Handling Middleware
app.use(errorMiddleware);

export { app };
export default app;

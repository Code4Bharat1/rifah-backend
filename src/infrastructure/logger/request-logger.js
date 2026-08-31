import morgan from "morgan";
import { env } from "../../config/env.js";

export const requestLogger = morgan(
  env.isDevelopment() ? "dev" : "combined",
  {
    skip: (req) => req.path === "/health" || req.path === "/api/v1/health",
  }
);

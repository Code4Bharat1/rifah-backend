import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),
  API_PREFIX: process.env.API_PREFIX || "/api/v1",

  DATABASE: {
    URI: process.env.MONGODB_URI || "mongodb://localhost:27017/rifah_db",
  },

  JWT: {
    SECRET: process.env.JWT_SECRET || "rifah_jwt_access_secret_key_change_in_production_32char",
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "rifah_jwt_refresh_secret_key_change_in_production_32char",
    REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10),
  },

  CORS: {
    ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1000", 10),
  },

  STORAGE: {
    UPLOAD_DIR: process.env.UPLOAD_DIR || "uploads",
    MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || "10", 10),
  },

  EMAIL: {
    HOST: process.env.SMTP_HOST || "",
    PORT: parseInt(process.env.SMTP_PORT || "587", 10),
    USER: process.env.SMTP_USER || "",
    PASS: process.env.SMTP_PASS || "",
    FROM: process.env.EMAIL_FROM || "RIFAH Chamber <no-reply@rifah.org>",
  },

  isDevelopment: () => (process.env.NODE_ENV || "development") === "development",
  isProduction: () => process.env.NODE_ENV === "production",
  isTest: () => process.env.NODE_ENV === "test",
};

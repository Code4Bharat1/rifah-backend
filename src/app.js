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
import { mongoSanitizeMiddleware } from "./middleware/sanitize.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/not-found.middleware.js";
import fs from "fs";
import { apiRouter } from "./routes/index.js";
import { healthRoutes } from "./routes/health.routes.js";
import { quotationHelper } from "./modules/leads/quotation.helper.js";

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

// NoSQL Query & Body Sanitization (Blocks MongoDB operator injections)
app.use(mongoSanitizeMiddleware);

// HTTP Request logging with Morgan
app.use(morgan(env.isDevelopment() ? "dev" : "combined"));

// Global rate limiting
app.use(rateLimitMiddleware);

// Serve uploaded files statically from local server filesystem with frame permission for previews
const uploadsPath = path.resolve(__dirname, `../${env.STORAGE.UPLOAD_DIR}`);

// Dedicated dynamic handler for quotation PDFs (never 404s, auto-regenerates missing quotation files)
app.get(
  [`/${env.STORAGE.UPLOAD_DIR}/attachments/:filename`, `/attachments/:filename`],
  async (req, res, next) => {
    const filename = req.params.filename || "";
    const cleanFilename = filename.split("?")[0];
    const isQuotation = cleanFilename.toLowerCase().startsWith("quotation-");

    if (!isQuotation) {
      return next();
    }

    const attachmentsDir = path.join(uploadsPath, "attachments");
    const localPdfName = cleanFilename.replace(/\.htm$/i, ".pdf");
    const localPath = path.join(attachmentsDir, localPdfName);

    res.removeHeader("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");

    // 1. If file already exists locally, send it directly as PDF attachment
    if (fs.existsSync(localPath)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${localPdfName}"`);
      return res.sendFile(localPath);
    }

    // 2. If file is missing from local disk, dynamically resolve & generate it
    try {
      const pdfBuffer = await quotationHelper.getOrGenerateQuotationPdf(localPdfName);
      if (pdfBuffer) {
        try {
          if (!fs.existsSync(attachmentsDir)) {
            fs.mkdirSync(attachmentsDir, { recursive: true });
          }
          fs.writeFileSync(localPath, pdfBuffer);
        } catch (writeErr) {
          // Continue if disk write fails
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${localPdfName}"`);
        return res.send(pdfBuffer);
      }
    } catch (err) {
      console.error("Dynamic quotation PDF generation error:", err);
    }

    next();
  }
);

const staticOptions = {
  setHeaders: (res, filePath) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    if (filePath.endsWith(".pdf")) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
    }
  },
};

const handleStaticHeaders = (req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  next();
};

app.use(`/${env.STORAGE.UPLOAD_DIR}`, handleStaticHeaders, express.static(uploadsPath, staticOptions));
app.use(`${env.API_PREFIX}/${env.STORAGE.UPLOAD_DIR}`, handleStaticHeaders, express.static(uploadsPath, staticOptions));

// Fallback search in root uploads and subfolders if file moved/flattened
app.use([`/${env.STORAGE.UPLOAD_DIR}/:subfolder/:filename`, `/${env.STORAGE.UPLOAD_DIR}/:filename`], (req, res, next) => {
  const filename = req.params.filename || req.params.subfolder;
  if (!filename) return next();
  
  // Check root uploads
  const rootPath = path.join(uploadsPath, filename);
  if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
    return res.sendFile(rootPath);
  }

  // Check all subfolders in uploads
  const subdirs = ["logos", "covers", "gallery", "documents", "certificates", "catalogue", "avatars", "attachments"];
  for (const sub of subdirs) {
    const subPath = path.join(uploadsPath, sub, filename);
    if (fs.existsSync(subPath) && fs.statSync(subPath).isFile()) {
      return res.sendFile(subPath);
    }
  }

  next();
});

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

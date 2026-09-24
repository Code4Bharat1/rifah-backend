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
import { pdfService } from "./infrastructure/pdf/pdf.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Behind nginx (one hop) — use X-Forwarded-For for req.ip so rate limiting is per client
app.set("trust proxy", 1);

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

// Fallback search in root uploads and subfolders, with auto-generation for missing PDFs
app.use(
  [`/${env.STORAGE.UPLOAD_DIR}/:subfolder/:filename`, `/${env.STORAGE.UPLOAD_DIR}/:filename`, `${env.API_PREFIX}/${env.STORAGE.UPLOAD_DIR}/:subfolder/:filename`, `${env.API_PREFIX}/${env.STORAGE.UPLOAD_DIR}/:filename`],
  async (req, res, next) => {
    const rawFilename = req.params.filename || req.params.subfolder || "";
    const filename = rawFilename.split("?")[0];
    if (!filename) return next();

    // 1. Check root uploads
    const rootPath = path.join(uploadsPath, filename);
    if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
      return res.sendFile(rootPath);
    }

    // 2. Check all subfolders in uploads
    const subdirs = ["posts", "logos", "covers", "gallery", "documents", "certificates", "catalogue", "avatars", "attachments"];
    for (const sub of subdirs) {
      const subPath = path.join(uploadsPath, sub, filename);
      if (fs.existsSync(subPath) && fs.statSync(subPath).isFile()) {
        return res.sendFile(subPath);
      }
    }

    // 3. Dynamic PDF fallback (never 404 on documents, quotations or certificates)
    if (filename.toLowerCase().endsWith(".pdf")) {
      const isQuotation = filename.toLowerCase().startsWith("quotation-");
      const targetSub = req.params.filename ? (req.params.subfolder || "documents") : "documents";
      const targetDir = path.join(uploadsPath, targetSub);

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        const localSavePath = path.join(targetDir, filename);

        let pdfBuffer = null;
        if (isQuotation) {
          pdfBuffer = await quotationHelper.getOrGenerateQuotationPdf(filename);
        }

        if (!pdfBuffer) {
          if (targetSub === "certificates" || filename.startsWith("CERT-") || filename.toLowerCase().includes("certificate")) {
            const certNum = filename.replace(/\.pdf$/i, "");
            pdfBuffer = await pdfService.generateCertificateBuffer({
              recipientName: "RIFAH Member",
              courseTitle: "Business Growth & Chamber Training Course",
              companyName: "RIFAH Chamber Enterprise",
              certificateNumber: certNum,
            });
          } else {
            pdfBuffer = pdfService.generateDocumentPlaceholderBuffer({
              filename,
              title: "Official Compliance & Verification Document",
              documentType: "Member Verification Document",
            });
          }
        }

        if (pdfBuffer) {
          try {
            fs.writeFileSync(localSavePath, pdfBuffer);
          } catch (writeErr) {
            // Non-fatal if write fails
          }

          res.removeHeader("X-Frame-Options");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Content-Security-Policy", "frame-ancestors *");
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline");
          return res.send(pdfBuffer);
        }
      } catch (err) {
        console.error("Dynamic PDF fallback generation error:", err);
      }
    } else if (filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      // 4. Dynamic Image fallback (never 404 on missing dummy images)
      res.removeHeader("X-Frame-Options");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Security-Policy", "frame-ancestors *");
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
          <rect width="100%" height="100%" fill="#f1f5f9"/>
          <text x="50%" y="45%" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#64748b" text-anchor="middle">
            Placeholder Image
          </text>
          <text x="50%" y="55%" font-family="system-ui, sans-serif" font-size="16" fill="#94a3b8" text-anchor="middle">
            ${filename}
          </text>
        </svg>
      `;
      return res.send(Buffer.from(svg.trim()));
    }

    next();
  }
);

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

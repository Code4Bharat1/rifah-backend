import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";
import { BadRequestError } from "../shared/errors/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUploadPath = path.resolve(__dirname, `../../${env.STORAGE.UPLOAD_DIR}`);

// Configure in-memory storage for direct Cloudinary streaming (no local disk clutter)
const storage = multer.memoryStorage();

// File filter (strictly safe images, videos, audio, PDFs, and office documents)
const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();
  const cleanName = path.basename(file.originalname || "").replace(/[\x00-\x1f\x80-\x9f]/g, "").toLowerCase();

  // Guard against dangerous extensions and double extension tricks (e.g. payload.php.png)
  const dangerousPatterns = [/\.php/i, /\.html?/i, /\.svg/i, /\.exe/i, /\.js/i, /\.jsx/i, /\.ts/i, /\.tsx/i, /\.sh/i, /\.bat/i, /\.cmd/i, /\.vbs/i, /\.msi/i];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(cleanName)) {
      return cb(
        new BadRequestError("Suspicious file name or prohibited extension detected."),
        false
      );
    }
  }

  const dangerousExtensions = [".html", ".htm", ".svg", ".php", ".js", ".jsx", ".ts", ".tsx", ".exe", ".sh", ".bat", ".cmd", ".vbs", ".msi"];
  if (dangerousExtensions.includes(ext)) {
    return cb(
      new BadRequestError(`File extension '${ext}' is not permitted for upload due to security restrictions.`),
      false
    );
  }

  const allowedImageMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/pjpeg",
    "image/x-png",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/bmp",
  ];
  const isImage = allowedImageMimes.includes(mime) || (mime.startsWith("image/") && mime !== "image/svg+xml");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");

  const allowedDocMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
  ];

  if (isImage || isVideo || isAudio || allowedDocMimeTypes.includes(mime)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `Unsupported or insecure file type: ${file.mimetype}. Allowed: JPEG, JPG, PNG, WEBP, GIF, AVIF, standard videos, audio, PDF, and office documents.`
      ),
      false
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit for media/documents
  },
});

// PDF-only filter specifically for compliance and verification documents
const pdfFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const cleanName = path.basename(file.originalname).replace(/[\x00-\x1f\x80-\x9f]/g, "").toLowerCase();

  const dangerousPatterns = [/\.php/i, /\.html?/i, /\.svg/i, /\.exe/i, /\.js/i, /\.jsx/i, /\.ts/i, /\.tsx/i, /\.sh/i, /\.bat/i, /\.cmd/i, /\.vbs/i, /\.msi/i];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(cleanName)) {
      return cb(
        new BadRequestError("Suspicious file name or prohibited extension detected."),
        false
      );
    }
  }

  if (file.mimetype === "application/pdf" && ext === ".pdf") {
    cb(null, true);
  } else {
    cb(
      new BadRequestError("Only official PDF documents (.pdf) are permitted for chamber verification."),
      false
    );
  }
};

export const uploadPdfOnly = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit for PDF documents
  },
});

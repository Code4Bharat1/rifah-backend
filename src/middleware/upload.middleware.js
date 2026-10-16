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

  // Guard against dangerous extensions. This checks the file's actual extension
  // (via path.extname, so only what the name truly ends in counts) — an earlier version
  // scanned the whole filename for these substrings anywhere, which wrongly blocked
  // legitimate files whose name merely contained one of these sequences without being
  // that type (e.g. a real "clip.ts" MPEG Transport Stream video got rejected because
  // the filename contains ".ts", the same short string as the blocked ".ts"/TypeScript
  // extension — even though this check two lines below already handles that extension
  // correctly and precisely on its own).
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
    fileSize: 100 * 1024 * 1024, // 15 MB limit for media/documents
  },
});

// PDF and official document scans filter specifically for compliance and verification documents
const pdfFileFilter = (req, file, cb) => {
  const mime = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  // See fileFilter above — same fix: check the actual extension only, not the whole
  // filename for these substrings anywhere in it.
  const dangerousExtensions = [".html", ".htm", ".svg", ".php", ".js", ".jsx", ".ts", ".tsx", ".exe", ".sh", ".bat", ".cmd", ".vbs", ".msi"];
  if (dangerousExtensions.includes(ext)) {
    return cb(
      new BadRequestError(`File extension '${ext}' is not permitted for upload due to security restrictions.`),
      false
    );
  }

  const allowedPdfMimes = [
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "applications/vnd.pdf",
    "text/pdf",
    "text/x-pdf",
    "application/download",
    "application/octet-stream",
  ];

  const allowedImageMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/pjpeg",
    "image/x-png",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/bmp",
  ];

  const isPdf = allowedPdfMimes.includes(mime) || ext === ".pdf";
  const isImageScan = allowedImageMimes.includes(mime) || [".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".bmp"].includes(ext);

  if (isPdf || isImageScan) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError("Only official PDF documents (.pdf) or image scans (.jpg, .png, .webp) are permitted for chamber verification."),
      false
    );
  }
};

export const uploadPdfOnly = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB limit for high-res PDF / official scans
  },
});

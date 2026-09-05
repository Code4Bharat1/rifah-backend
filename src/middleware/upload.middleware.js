import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";
import { BadRequestError } from "../shared/errors/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUploadPath = path.resolve(__dirname, `../../${env.STORAGE.UPLOAD_DIR}`);

// Configure disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine subfolder dynamically based on fieldname or route
    let subfolder = "";
    if (file.fieldname === "avatar") subfolder = "avatars";
    else if (file.fieldname === "logo") subfolder = "logos";
    else if (file.fieldname === "cover" || file.fieldname === "coverImage") subfolder = "covers";
    else if (file.fieldname === "gallery") subfolder = "gallery";
    else if (file.fieldname === "document" || file.fieldname === "verification") subfolder = "documents";
    else if (file.fieldname === "catalogue" || file.fieldname === "product") subfolder = "catalogue";
    else if (file.fieldname === "attachment" || file.fieldname === "file" || file.fieldname === "media") subfolder = "attachments";

    const targetDir = path.join(baseUploadPath, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

// File filter (strictly safe images, videos, audio, PDFs, and office documents)
const fileFilter = (req, file, cb) => {
  const allowedImageMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const isImage = allowedImageMimes.includes(file.mimetype);
  const isVideo = file.mimetype.startsWith("video/");
  const isAudio = file.mimetype.startsWith("audio/");

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

  const ext = path.extname(file.originalname).toLowerCase();
  const dangerousExtensions = [".html", ".htm", ".svg", ".php", ".js", ".jsx", ".ts", ".tsx", ".exe", ".sh", ".bat", ".cmd", ".vbs", ".msi"];
  if (dangerousExtensions.includes(ext)) {
    return cb(
      new BadRequestError(`File extension '${ext}' is not permitted for upload due to security restrictions.`),
      false
    );
  }

  if (isImage || isVideo || isAudio || allowedDocMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `Unsupported or insecure file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, GIF, standard videos, audio, PDF, and office documents.`
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

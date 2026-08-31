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

// File filter (images, PDFs, documents)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `Unsupported file type: ${file.mimetype}. Allowed: JPG, PNG, WEBP, SVG, PDF, DOC.`
      ),
      false
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.STORAGE.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
});

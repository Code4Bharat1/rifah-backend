import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUploadDir = path.resolve(__dirname, `../../../${env.STORAGE.UPLOAD_DIR}`);

import { cloudinaryService } from "./cloudinary.service.js";

// Ensure base upload directory exists
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

export const storageService = {
  /**
   * Uploads a file to Cloudinary directly from memory Buffer without disk clutter
   * @param {Object} file - Express multer file object (with .buffer or .path)
   * @param {string} [subfolder=''] - e.g. 'logos', 'covers', 'gallery', 'documents'
   * @returns {Promise<string>} Public URL (Cloudinary secure_url or local static path)
   */
  uploadFile: async (file, subfolder = "") => {
    if (!file) return null;

    const source = file.buffer || file.path;

    if (cloudinaryService.isConfigured() && source) {
      try {
        const cleanSub = subfolder.replace(/^\/+|\/+$/g, "");
        const folder = cleanSub ? `rifah/${cleanSub}` : "rifah";

        const result = await cloudinaryService.upload(source, {
          folder,
          resource_type: "auto",
          mimetype: file.mimetype,
        });

        if (result && result.secure_url) {
          logger.info(`File streamed directly to Cloudinary: ${result.secure_url}`);
          return result.secure_url;
        }
      } catch (err) {
        logger.error("Cloudinary stream failed, falling back to local file disk:", err);
      }
    }

    // Fallback: only if Cloudinary is unavailable, save buffer to local disk
    const cleanSub = subfolder ? `${subfolder.replace(/^\/+|\/+$/g, "")}/` : "";
    const targetDir = path.join(baseUploadDir, cleanSub);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${file.fieldname || "file"}-${uniqueSuffix}${ext}`;
    const localFilePath = path.join(targetDir, filename);

    if (file.buffer) {
      fs.writeFileSync(localFilePath, file.buffer);
    }

    return `/${env.STORAGE.UPLOAD_DIR}/${cleanSub}${filename}`;
  },

  /**
   * Generates a public static URL for an uploaded file
   * @param {string} filename
   * @param {string} [subfolder='']
   * @returns {string} Public URL
   */
  getPublicUrl: (filename, subfolder = "") => {
    if (!filename) return null;
    if (filename.startsWith("http://") || filename.startsWith("https://")) {
      return filename;
    }
    const cleanSub = subfolder ? `${subfolder.replace(/^\/+|\/+$/g, "")}/` : "";
    return `/${env.STORAGE.UPLOAD_DIR}/${cleanSub}${filename}`;
  },

  /**
   * Deletes a local file safely
   * @param {string} relativePath - e.g. 'uploads/businesses/photo.jpg' or just 'photo.jpg'
   * @returns {boolean}
   */
  deleteFile: (relativePath) => {
    try {
      if (!relativePath) return false;
      const cleanPath = relativePath.replace(new RegExp(`^/?${env.STORAGE.UPLOAD_DIR}/?`), "");
      const fullPath = path.join(baseUploadDir, cleanPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.info(`Deleted local file: ${fullPath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Error deleting local file:", error);
      return false;
    }
  },

  /**
   * Returns base upload directory path
   */
  getBaseUploadDir: () => baseUploadDir,
};

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
   * Uploads a file to Cloudinary if configured, or uses local storage fallback
   * @param {Object} file - Express multer file object
   * @param {string} [subfolder=''] - e.g. 'logos', 'covers', 'gallery', 'documents'
   * @returns {Promise<string>} Public URL (Cloudinary secure_url or local static path)
   */
  uploadFile: async (file, subfolder = "") => {
    if (!file) return null;

    if (cloudinaryService.isConfigured()) {
      try {
        const source = file.path || file.buffer;
        const cleanSub = subfolder.replace(/^\/+|\/+$/g, "");
        const folder = cleanSub ? `rifah/${cleanSub}` : "rifah";

        const result = await cloudinaryService.upload(source, {
          folder,
          resource_type: "auto",
        });

        // Clean up temporary local disk file if present
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // Ignore unlink error
          }
        }

        logger.info(`File uploaded to Cloudinary: ${result.secure_url}`);
        return result.secure_url;
      } catch (err) {
        logger.error("Cloudinary upload failed, falling back to local file path:", err);
      }
    }

    return storageService.getPublicUrl(file.filename, subfolder);
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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUploadDir = path.resolve(__dirname, `../../../${env.STORAGE.UPLOAD_DIR}`);

// Ensure base upload directory exists
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

export const storageService = {
  /**
   * Generates a public static URL for an uploaded file
   * @param {string} filename
   * @param {string} [subfolder='']
   * @returns {string} Public URL
   */
  getPublicUrl: (filename, subfolder = "") => {
    if (!filename) return null;
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

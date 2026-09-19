import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUploadDir = path.resolve(__dirname, `../../../${env.STORAGE.UPLOAD_DIR}`);

import { File } from "../../modules/files/file.model.js";

// Ensure base upload directory exists
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

export const storageService = {
  /**
   * Uploads a file to MongoDB directly from memory Buffer
   * @param {Object} file - Express multer file object (with .buffer or .path)
   * @param {string} [subfolder=''] - e.g. 'logos', 'covers', 'gallery', 'documents'
   * @returns {Promise<string>} Public API URL for the file
   */
  uploadFile: async (file, subfolder = "") => {
    if (!file) return null;

    const source = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
    if (!source) {
      throw new Error("No file buffer or valid path provided for upload");
    }

    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${file.fieldname || "file"}-${uniqueSuffix}${ext}`;

    // Create file record in DB
    const newFile = await File.create({
      filename,
      mimetype: file.mimetype || "application/octet-stream",
      data: source,
      size: source.length,
    });

    logger.info(`File saved directly to MongoDB. ID: ${newFile._id}`);

    // Return the URL path to our new files endpoint
    return `/api/v1/files/${newFile._id}`;
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
   * Deletes a local file or MongoDB file safely
   * @param {string} relativePath - e.g. '/api/v1/files/12345' or 'uploads/photo.jpg'
   * @returns {Promise<boolean>}
   */
  deleteFile: async (relativePath) => {
    try {
      if (!relativePath) return false;
      
      // Check if it's a MongoDB file path
      if (relativePath.includes("/api/v1/files/")) {
        const fileId = relativePath.split("/").pop();
        if (fileId) {
          const result = await File.findByIdAndDelete(fileId);
          if (result) {
            logger.info(`Deleted MongoDB file: ${fileId}`);
            return true;
          }
        }
        return false;
      }

      // Fallback for legacy disk files
      const cleanPath = relativePath.replace(new RegExp(`^/?${env.STORAGE.UPLOAD_DIR}/?`), "");
      const fullPath = path.join(baseUploadDir, cleanPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        logger.info(`Deleted local file: ${fullPath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Error deleting file:", error);
      return false;
    }
  },

  /**
   * Returns base upload directory path
   */
  getBaseUploadDir: () => baseUploadDir,
};

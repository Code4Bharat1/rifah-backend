import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";
import { Readable } from "stream";
import path from "path";

const isConfigured = () => {
  return Boolean(
    (env.CLOUDINARY.CLOUD_NAME && env.CLOUDINARY.API_KEY && env.CLOUDINARY.API_SECRET) ||
    env.CLOUDINARY.URL ||
    process.env.CLOUDINARY_URL
  );
};

const ensureConfigured = () => {
  if (!isConfigured()) return false;
  if (env.CLOUDINARY.URL || process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: env.CLOUDINARY.URL || process.env.CLOUDINARY_URL,
    });
  } else {
    cloudinary.config({
      cloud_name: env.CLOUDINARY.CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY.API_KEY || process.env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY.API_SECRET || process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  return true;
};

// Initial config
ensureConfigured();

export const cloudinaryService = {
  isConfigured,

  /**
   * Upload a file (path or Buffer) to Cloudinary
   * @param {string|Buffer} fileSource - Local file path or Buffer
   * @param {Object} [options={}] - Cloudinary upload options (e.g. folder, public_id)
   * @returns {Promise<Object>} Cloudinary upload result
   */
  upload: async (fileSource, options = {}) => {
    if (!ensureConfigured()) {
      throw new Error("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env");
    }

    const defaultOptions = {
      resource_type: "auto",
      folder: "rifah",
      ...options,
    };

    // If source is a file path string
    if (typeof fileSource === "string") {
      try {
        const resolvedPath = path.resolve(fileSource);
        const result = await cloudinary.uploader.upload(resolvedPath, defaultOptions);
        return result;
      } catch (error) {
        logger.error("Cloudinary file upload error:", error);
        throw error;
      }
    }

    // If source is a Buffer (from memoryStorage or fs.readFileSync)
    if (Buffer.isBuffer(fileSource)) {
      try {
        const mimeType = options.mimetype || "image/jpeg";
        const base64Data = `data:${mimeType};base64,${fileSource.toString("base64")}`;
        const result = await cloudinary.uploader.upload(base64Data, defaultOptions);
        return result;
      } catch (error) {
        // Fallback to upload_stream if base64 upload errors
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(defaultOptions, (err, res) => {
            if (err) {
              logger.error("Cloudinary stream upload error:", err);
              return reject(err);
            }
            resolve(res);
          });
          stream.end(fileSource);
        });
      }
    }

    throw new Error("Invalid file source provided to Cloudinary uploader. Expected file path string or Buffer.");
  },

  /**
   * Delete a file from Cloudinary
   * @param {string} publicId - Cloudinary asset public ID
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  delete: async (publicId, options = {}) => {
    if (!isConfigured()) return null;
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, options, (error, result) => {
        if (error) {
          logger.error("Cloudinary delete error:", error);
          return reject(error);
        }
        resolve(result);
      });
    });
  },
};

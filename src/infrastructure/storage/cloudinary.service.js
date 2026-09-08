import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.js";
import { logger } from "../logger/logger.js";
import { Readable } from "stream";

const isConfigured = () => {
  return Boolean(
    (env.CLOUDINARY.CLOUD_NAME && env.CLOUDINARY.API_KEY && env.CLOUDINARY.API_SECRET) ||
    env.CLOUDINARY.URL ||
    process.env.CLOUDINARY_URL
  );
};

// Configure cloudinary instance
if (isConfigured()) {
  if (env.CLOUDINARY.URL || process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: env.CLOUDINARY.URL || process.env.CLOUDINARY_URL,
    });
  } else {
    cloudinary.config({
      cloud_name: env.CLOUDINARY.CLOUD_NAME,
      api_key: env.CLOUDINARY.API_KEY,
      api_secret: env.CLOUDINARY.API_SECRET,
      secure: true,
    });
  }
}

export const cloudinaryService = {
  isConfigured,

  /**
   * Upload a file (path or Buffer) to Cloudinary
   * @param {string|Buffer} fileSource - Local file path or Buffer
   * @param {Object} [options={}] - Cloudinary upload options (e.g. folder, public_id)
   * @returns {Promise<Object>} Cloudinary upload result
   */
  upload: async (fileSource, options = {}) => {
    if (!isConfigured()) {
      throw new Error("Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env");
    }

    const defaultOptions = {
      resource_type: "auto",
      folder: "rifah",
      ...options,
    };

    // If source is a file path string
    if (typeof fileSource === "string") {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(fileSource, defaultOptions, (error, result) => {
          if (error) {
            logger.error("Cloudinary file upload error:", error);
            return reject(error);
          }
          resolve(result);
        });
      });
    }

    // If source is a Buffer (from memoryStorage or fs.readFileSync)
    if (Buffer.isBuffer(fileSource)) {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(defaultOptions, (error, result) => {
          if (error) {
            logger.error("Cloudinary stream upload error:", error);
            return reject(error);
          }
          resolve(result);
        });

        // Pipe Buffer into Cloudinary upload stream using Node native stream
        Readable.from(fileSource).pipe(uploadStream);
      });
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

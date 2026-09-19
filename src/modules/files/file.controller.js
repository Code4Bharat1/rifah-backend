import { File } from "./file.model.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { NotFoundError } from "../../shared/errors/errors.js";

export const fileController = {
  /**
   * Fetch a file by ID and stream its binary data
   */
  getFile: asyncHandler(async (req, res) => {
    const { id } = req.params;

    const file = await File.findById(id);
    if (!file) {
      throw new NotFoundError("File not found");
    }

    // Set caching headers for improved performance
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", file.mimetype);
    res.setHeader("Content-Length", file.size);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    
    // For PDFs and Images, we allow framing globally as they might be previews
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.removeHeader("X-Frame-Options");

    return res.send(file.data);
  }),
};

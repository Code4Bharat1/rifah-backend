import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { eventMediaService } from "./gallery.service.js";

export const galleryController = {
  listFolders: asyncHandler(async (req, res) => {
    const { folders, meta } = await eventMediaService.listFolders(req.query, req.user);
    return ApiResponse.success(res, folders, "Gallery folders fetched successfully", 200, meta);
  }),

  getFolder: asyncHandler(async (req, res) => {
    const data = await eventMediaService.getFolder(req.params.eventId, req.user);
    return ApiResponse.success(res, data, "Event gallery fetched successfully");
  }),

  addMedia: asyncHandler(async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    const created = await eventMediaService.addMedia(
      req.params.eventId,
      files,
      { caption: req.body?.caption },
      req.user
    );
    return ApiResponse.success(
      res,
      created,
      `${created.length} item${created.length === 1 ? "" : "s"} added to the gallery`,
      201
    );
  }),

  removeMedia: asyncHandler(async (req, res) => {
    const data = await eventMediaService.removeMedia(req.params.mediaId, req.user);
    return ApiResponse.success(res, data, "Media removed from the gallery");
  }),
};

export default galleryController;

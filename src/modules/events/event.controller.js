import { eventService } from "./event.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

export const eventController = {
  listEvents: asyncHandler(async (req, res) => {
    const { events, meta } = await eventService.listEvents(req.query, req.user);
    return ApiResponse.success(res, events, "Events retrieved", 200, meta);
  }),

  getEventBySlugOrId: asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const event = await eventService.getEventBySlugOrId(identifier);
    return ApiResponse.success(res, event, "Event details retrieved");
  }),

  createEvent: asyncHandler(async (req, res) => {
    const created = await eventService.createEvent(req.body);
    return ApiResponse.created(res, created, "Event created successfully");
  }),

  registerForEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const event = await eventService.registerUserForEvent(id, req.user.id);
    return ApiResponse.success(res, event, "Registered for event successfully");
  }),

  updateEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await eventService.updateEvent(id, req.body);
    return ApiResponse.success(res, updated, "Event updated successfully");
  }),

  uploadCover: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image uploaded", 400);
    }
    const coverUrl = storageService.getPublicUrl(req.file.filename, "covers");
    const updated = await eventService.updateEvent(id, { coverImage: coverUrl });
    return ApiResponse.success(res, { coverImage: coverUrl, event: updated }, "Event cover uploaded successfully");
  }),
};

import { eventService } from "./event.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

import { auditService } from "../audit/audit.service.js";

export const eventController = {
  listEvents: asyncHandler(async (req, res) => {
    const { events, meta } = await eventService.listEvents(req.query, req.user);
    return ApiResponse.success(res, events, "Events retrieved", 200, meta);
  }),

  getEventBySlugOrId: asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const event = await eventService.getEventBySlugOrId(identifier, req.user);
    return ApiResponse.success(res, event, "Event details retrieved");
  }),

  createEvent: asyncHandler(async (req, res) => {
    const created = await eventService.createEvent(req.body, req.user);
    await auditService.logAction({
      actor: req.user,
      action: "CREATE",
      targetModel: "Event",
      targetId: created._id,
      summary: `Created new event: ${created.title}`,
      ipAddress: req.ip
    });
    return ApiResponse.created(res, created, "Event created successfully");
  }),

  registerForEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const event = await eventService.registerUserForEvent(id, req.user.id);
    return ApiResponse.success(res, event, "Registered for event successfully");
  }),

  registerPaidForEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { paymentId, transactionId } = req.body;
    if (!paymentId) {
      return ApiResponse.error(res, "Payment details are required for paid events", 400);
    }
    const event = await eventService.registerUserForEvent(id, req.user.id, { paymentId, transactionId });
    return ApiResponse.success(res, event, "Paid registration for event successful");
  }),

  getEventRegistrations: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const registrations = await eventService.getEventRegistrations(id, req.user);
    return ApiResponse.success(res, registrations, "Event registrations retrieved");
  }),

  updateEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await eventService.updateEvent(id, req.body, req.user);
    await auditService.logAction({
      actor: req.user,
      action: "UPDATE",
      targetModel: "Event",
      targetId: updated._id,
      summary: `Updated event: ${updated.title}`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, updated, "Event updated successfully");
  }),

  uploadCover: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image uploaded", 400);
    }
    const coverUrl = await storageService.uploadFile(req.file, "covers");
    const updated = await eventService.updateEvent(id, { coverImage: coverUrl }, req.user);
    return ApiResponse.success(res, { coverImage: coverUrl, event: updated }, "Event cover uploaded successfully");
  }),

  deleteEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    // For delete, we might want to fetch the event name before deleting or just log the ID
    const event = await eventService.getEventBySlugOrId(id, req.user);
    await eventService.deleteEvent(id, req.user);
    await auditService.logAction({
      actor: req.user,
      action: "DELETE",
      targetModel: "Event",
      targetId: id,
      summary: `Deleted event: ${event?.title || id}`,
      ipAddress: req.ip
    });
    return ApiResponse.success(res, null, "Event deleted successfully");
  }),
};

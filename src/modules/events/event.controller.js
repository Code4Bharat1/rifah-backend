import { eventService } from "./event.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { pdfService } from "../../infrastructure/pdf/pdf.service.js";

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
    const payload = { ...req.body };
    if (payload.isPaid !== undefined) {
      payload.isPaid = payload.isPaid === true || payload.isPaid === "true" || payload.isPaid === "Paid";
      if (payload.isPaid) {
        payload.ticketPrice = Number(payload.ticketPrice) || 0;
        payload.memberPrice = Number(payload.memberPrice) || 0;
      } else {
        payload.ticketPrice = 0;
        payload.memberPrice = 0;
        payload.memberCouponCode = "";
      }
    }
    const created = await eventService.createEvent(payload, req.user);
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
    const { paymentId, transactionId, amount, couponApplied } = req.body;
    if (!paymentId) {
      return ApiResponse.error(res, "Payment details are required for paid events", 400);
    }
    const event = await eventService.registerUserForEvent(id, req.user.id, { paymentId, transactionId, amount, couponApplied });
    return ApiResponse.success(res, event, "Paid registration for event successful");
  }),

  getEventRegistrations: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const registrations = await eventService.getEventRegistrations(id, req.user);
    return ApiResponse.success(res, registrations, "Event registrations retrieved");
  }),

  downloadParticipantsPdf: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const event = await eventService.getEventBySlugOrId(id, req.user);
    if (!event) return ApiResponse.error(res, "Event not found", 404);

    const registrations = await eventService.getEventRegistrations(id, req.user);
    const pdfBuffer = await pdfService.generateParticipantsListBuffer({
      eventTitle: event.title,
      eventDate: event.date,
      chapter: event.chapter,
      registrations,
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Participants-${event.title.replace(/\s+/g, "_")}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }),

  updateEvent: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const payload = { ...req.body };
    if (payload.isPaid !== undefined) {
      payload.isPaid = payload.isPaid === true || payload.isPaid === "true" || payload.isPaid === "Paid";
      if (payload.isPaid) {
        if (payload.ticketPrice !== undefined) payload.ticketPrice = Number(payload.ticketPrice) || 0;
        if (payload.memberPrice !== undefined) payload.memberPrice = Number(payload.memberPrice) || 0;
      } else {
        payload.ticketPrice = 0;
        payload.memberPrice = 0;
        payload.memberCouponCode = "";
      }
    }
    const updated = await eventService.updateEvent(id, payload, req.user);
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

  uploadPoster: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image uploaded", 400);
    }
    const posterUrl = await storageService.uploadFile(req.file, "covers"); // Re-using covers folder
    const updated = await eventService.updateEvent(id, { posterImage: posterUrl }, req.user);
    return ApiResponse.success(res, { posterImage: posterUrl, event: updated }, "Event poster uploaded successfully");
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

  markAttendance: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;
    const event = await eventService.markAttendance(id, userId);
    return ApiResponse.success(res, event, "Attendance marked successfully");
  }),

  getOperations: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ops = await eventService.getOperations(id, req.user);
    return ApiResponse.success(res, ops, "Operations data retrieved");
  }),

  updateOperations: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updated = await eventService.updateOperations(id, req.body, req.user);
    return ApiResponse.success(res, updated, "Operations updated successfully");
  }),

  toggleCheckin: asyncHandler(async (req, res) => {
    const { id, attendeeId } = req.params;
    const { attendanceStatus } = req.body;
    const result = await eventService.toggleCheckin(id, attendeeId, attendanceStatus || "Present");
    return ApiResponse.success(res, result, "Attendee check-in status updated");
  }),

  assignRolesBulk: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await eventService.assignRolesBulk(id, req.body?.assignments, req.user.id || req.user._id);
    return ApiResponse.success(res, result, "Team assignments saved");
  }),

  setGateStatus: asyncHandler(async (req, res) => {
    const { id, attendeeId } = req.params;
    const { gateStatus } = req.body;
    const result = await eventService.setGateStatus(id, attendeeId, gateStatus, req.user);
    return ApiResponse.success(res, result, `Attendee ${result.gateStatus} at the gate`);
  }),

  addFinance: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await eventService.addFinanceTransaction(id, req.body, req.user);
    return ApiResponse.success(res, result, "Financial transaction saved");
  }),

  // ─── Ask & Give Board ──────────────────────────────────────────────────────
  getAskGiveBoard: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const board = await eventService.getAskGiveBoard(id);
    return ApiResponse.success(res, board, "Ask & Give board retrieved");
  }),

  updateAttendeeAskGive: asyncHandler(async (req, res) => {
    const { id, attendeeId } = req.params;
    const { asks, gives } = req.body;
    const result = await eventService.updateAttendeeAskGive(id, attendeeId, { asks, gives });
    return ApiResponse.success(res, result, "Ask & Give updated");
  }),

  // ─── Event Scripts ─────────────────────────────────────────────────────────
  getScripts: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const scripts = await eventService.getScripts(id);
    return ApiResponse.success(res, scripts, "Event scripts retrieved");
  }),

  updateScript: asyncHandler(async (req, res) => {
    const { id, segmentId } = req.params;
    const { customText, language } = req.body;
    const result = await eventService.updateScript(id, segmentId, { customText, language });
    return ApiResponse.success(res, result, "Script updated");
  }),

  // ─── Certificate Generation ────────────────────────────────────────────────
  generateCertificate: asyncHandler(async (req, res) => {
    const { id, attendeeId } = req.params;
    const { style, accentColor } = req.query;
    
    // Check if event and attendee exist and get details
    const event = await eventService.getEventBySlugOrId(id, req.user);
    if (!event) return ApiResponse.error(res, "Event not found", 404);
    
    // We import this dynamically so it doesn't break if pdfkit has issues
    const { generateCertificate } = await import("./certificate.util.js");
    
    let attendeeName = "Attendee Name";
    let actualAttendeeId = attendeeId;
    
    if (attendeeId !== "preview") {
      const registrations = await eventService.getEventRegistrations(id, req.user);
      const attendee = registrations.find(r => r._id.toString() === attendeeId);
      if (!attendee) return ApiResponse.error(res, "Attendee not found", 404);
      attendeeName = attendee.user?.name || "Participant";
    }

    const pdfBuffer = await generateCertificate(
      { name: attendeeName, id: actualAttendeeId },
      {
        title: event.title,
        date: event.date,
        chapter: event.chapter,
        signatory1Role: event.signatory1Role,
        signatory2Role: event.signatory2Role
      },
      { style, accentColor }
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Certificate-${attendeeName.replace(/\s+/g, '_')}.pdf"`,
      "Content-Length": pdfBuffer.length
    });
    
    res.end(pdfBuffer);
  }),

  // ─── Event Role Assignments ────────────────────────────────────────────────
  assignRole: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role, userId } = req.body;
    const assignedBy = req.user.id || req.user._id;
    const result = await eventService.assignRole(id, role, userId || null, assignedBy);
    return ApiResponse.success(res, result, userId ? "Role assigned" : "Role unassigned");
  }),

  getRoleAssignments: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await eventService.getRoleAssignments(id);
    return ApiResponse.success(res, data, "Role assignments retrieved");
  }),

  getMyDuty: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = await eventService.getMyDuty(id, req.user);
    return ApiResponse.success(res, data, "Duty details retrieved");
  }),
};

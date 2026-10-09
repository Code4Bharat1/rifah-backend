import { eventService } from "./event.service.js";
import { googleMeetService } from "../../infrastructure/google/google-meet.service.js";
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
    const { paymentId, transactionId, amount, baseAmount, gstAmount } = req.body;
    if (!paymentId) {
      return ApiResponse.error(res, "Payment details are required for paid events", 400);
    }
    const event = await eventService.registerUserForEvent(id, req.user.id, { 
      paymentId, 
      transactionId, 
      amount, 
      baseAmount, 
      gstAmount 
    });
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

  // BUG-055: the Certificate Signatory image inputs previously only did
  // `signatory1Image: URL.createObjectURL(file)` on the frontend — a browser-only blob:
  // reference that was never actually uploaded anywhere. It looked fine until the tab
  // closed (blob URLs die with the page), and the backend certificate generator
  // (certificate.util.js loadImageBuffer) could never fetch it at all since it never
  // existed outside that one browser tab. Mirrors uploadCover/uploadPoster: store the
  // real file and persist the returned URL on the event's flat signatory field.
  uploadSignatoryImage: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image uploaded", 400);
    }
    const slot = req.body?.slot === "logo" ? "logo" : req.body?.slot === "2" ? "2" : "1";
    
    let field;
    if (slot === "logo") field = "logoImage";
    else if (slot === "2") field = "signatory2Image";
    else field = "signatory1Image";
    const imageUrl = await storageService.uploadFile(req.file, "signatures");
    const updated = await eventService.updateOperations(id, { [field]: imageUrl }, req.user);
    return ApiResponse.success(
      res,
      { [field]: imageUrl, event: updated },
      "Signatory signature uploaded successfully"
    );
  }),

  // BUG-060: see eventService.setKeynotePoster for why this bypasses updateOperations.
  uploadKeynotePoster: asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
      return ApiResponse.error(res, "No image uploaded", 400);
    }
    const slot = req.body?.slot === "2" ? "2" : "1";
    const field = slot === "2" ? "keynote2Poster" : "keynote1Poster";
    const posterUrl = await storageService.uploadFile(req.file, "covers");
    const updated = await eventService.setKeynotePoster(id, slot, posterUrl, req.user);
    return ApiResponse.success(
      res,
      { [field]: posterUrl, event: updated },
      "Keynote poster uploaded successfully"
    );
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
      // BUG-041: certificates weren't reachable by the attendee/public viewer at
      // all — this route used to require Central/State/Chapter Admin, and even
      // then getEventRegistrations() scoped results to events the requester
      // personally created, so a genuine attendee viewing their own certificate
      // always got "Attendee not found" / 403. `skipOwnerScope` lets us look the
      // registration up here, and authorization below allows either an admin or
      // the attendee themselves.
      const registrations = await eventService.getEventRegistrations(id, req.user, { skipOwnerScope: true });
      const attendee = registrations.find(r => r._id.toString() === attendeeId);
      if (!attendee) return ApiResponse.error(res, "Attendee not found", 404);

      const isAdmin = req.user && ["central_admin", "state_admin", "chapter_admin"].includes(req.user.role);
      const isSelf = req.user && attendee.user?._id && String(attendee.user._id) === String(req.user.id || req.user._id);
      if (!isAdmin && !isSelf) {
        return ApiResponse.error(res, "You are not authorized to view this certificate", 403);
      }

      attendeeName = attendee.user?.name || "Participant";
    } else {
      // Live preview of the certificate design is admin-only.
      const isAdmin = req.user && ["central_admin", "state_admin", "chapter_admin"].includes(req.user.role);
      if (!isAdmin) {
        return ApiResponse.error(res, "You are not authorized to preview this certificate", 403);
      }
    }

    // BUG-037/038/039: previously this only used ?style=/?accentColor= query
    // params (which the certificate download/print button never actually sends)
    // and never read the event's own saved certificateStyle/certificateAccentColor
    // or any signatory name/image — so every certificate rendered identically with
    // no signatures regardless of what was configured in Operations Centre. The
    // event's saved settings are now the source of truth, with any explicit query
    // params (e.g. a live preview) taking precedence.
    const pdfBuffer = await generateCertificate(
      { name: attendeeName, id: actualAttendeeId },
      {
        title: event.title,
        date: event.date,
        chapter: event.chapter,
        signatory1Role: event.signatory1Role,
        signatory1Name: event.signatory1Name,
        signatory1Image: event.signatory1Image,
        signatory2Role: event.signatory2Role,
        signatory2Name: event.signatory2Name,
        signatory2Image: event.signatory2Image,
      },
      {
        style: style || event.certificateStyle,
        accentColor: accentColor || event.certificateAccentColor,
      }
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

  generateMeetLink: asyncHandler(async (req, res) => {
    const { title, description, date, startTime, endTime } = req.body || {};
    const result = await googleMeetService.generateMeetingLink({
      title,
      description,
      date,
      startTime,
      endTime,
    });
    return ApiResponse.success(res, result, "Google Meet link generated successfully");
  }),

  getGoogleMeetAuthUrl: asyncHandler(async (req, res) => {
    const authUrl = googleMeetService.getAuthUrl();
    return ApiResponse.success(res, { authUrl }, "Google OAuth URL generated");
  }),

  handleGoogleMeetCallback: asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("<h3>Authorization code missing</h3>");
    }
    try {
      const tokens = await googleMeetService.exchangeCodeForTokens(code);
      const refreshToken = tokens.refresh_token;

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Meet Authorization Success</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 600px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
            h2 { color: #10b981; margin-top: 0; }
            .token-box { background: #0f172a; border: 1px dashed #64748b; padding: 12px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 14px; color: #38bdf8; margin: 16px 0; user-select: all; }
            .instructions { font-size: 14px; line-height: 1.6; color: #94a3b8; }
            .badge { display: inline-block; background: rgba(16, 185, 129, 0.2); color: #34d399; font-weight: 600; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">Google Meet Connected</span>
            <h2>Google Authorization Successful!</h2>
            <p class="instructions">Here is your Google Refresh Token. Copy this key and add it to your <code>rifah-backend/.env</code>:</p>
            <div class="token-box">${refreshToken || "Token already granted or refresh token was not returned (try revoking app access in Google Security settings if you need a new refresh token)."}</div>
            <p class="instructions">Set in <strong>rifah-backend/.env</strong>:</p>
            <div class="token-box">GOOGLE_MEET_REFRESH_TOKEN=${refreshToken || ""}</div>
            <p class="instructions">Once added, restart your backend server. Google Meet generation will be fully live!</p>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send(`<h3>Failed to exchange code:</h3><pre>${err.message}</pre>`);
    }
  }),

<<<<<<< Updated upstream
  /**
   * Public Event Ticket QR Verification
   * GET /api/v1/events/tickets/verify/:ticketId?token=...
   */
  verifyTicket: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { token } = req.query;

    const result = await eventService.verifyTicket(ticketId, token);
    return ApiResponse.success(res, result, result.verified ? "Ticket verified successfully" : "Verification completed");
  }),

  /**
   * Staff / Admin Event Check-in
   * POST /api/v1/events/tickets/check-in/:ticketId
   */
  checkInTicket: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { checkedInBy } = req.body;

    const result = await eventService.checkInTicket(ticketId, checkedInBy, req.user);
    if (result.alreadyCheckedIn) {
      return res.status(409).json({
        success: false,
        data: result,
        message: result.message,
      });
    }
    return ApiResponse.success(res, result, result.message);
  }),

  /**
   * Digital Pass Retrieval
   * GET /api/v1/events/tickets/:ticketId/pass
   */
  getTicketPass: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { token } = req.query;

    const result = await eventService.getTicketPass(ticketId, token);
    return ApiResponse.success(res, result, "Digital pass retrieved successfully");
  }),

  /**
   * Admin Ticket Status Management (Cancel / Refund)
   * PATCH /api/v1/events/tickets/:ticketId/status
   */
  updateTicketStatus: asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { status, reason } = req.body;

    const result = await eventService.updateTicketStatus(ticketId, status, reason, req.user?._id);
    return ApiResponse.success(res, result, result.message);
=======
  payDelegationInstallment: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { installmentNumber, paymentMethod, transactionId } = req.body;
    const result = await eventService.payDelegationInstallment(id, req.user.id || req.user._id, installmentNumber, {
      method: paymentMethod,
      transactionId,
    });
    return ApiResponse.success(res, result, `Installment #${installmentNumber} payment confirmed & invoice generated`);
  }),

  triggerDelegationReminders: asyncHandler(async (req, res) => {
    await eventService.checkDelegationInstallmentReminders();
    return ApiResponse.success(res, { triggered: true }, "Delegation installment reminders processed");
>>>>>>> Stashed changes
  }),
};

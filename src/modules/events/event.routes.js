import { Router } from "express";
import { eventController } from "./event.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  validateCreateEvent,
  validateUpdateEvent,
} from "./event.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";
import { requireEventRoleOrAdmin } from "../../middleware/event-role.middleware.js";
import { verificationRateLimitMiddleware } from "../../middleware/rate-limit.middleware.js";

const router = Router();

// Secure Event Ticket QR Verification & Staff Check-in Routes (Must precede /:identifier)
router.get("/tickets/verify/:ticketId", verificationRateLimitMiddleware, eventController.verifyTicket);
router.post("/tickets/check-in/:ticketId", optionalAuthMiddleware, eventController.checkInTicket);
router.get("/tickets/:ticketId/pass", eventController.getTicketPass);
router.patch("/tickets/:ticketId/status", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN), eventController.updateTicketStatus);

// Google Meet Integration routes (Must be declared before /:identifier)
router.post(
  "/generate-meet",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  eventController.generateMeetLink
);
router.get(
  "/google/auth-url",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  eventController.getGoogleMeetAuthUrl
);
router.get("/google/oauth-callback", eventController.handleGoogleMeetCallback);

// Public routes
router.get("/", optionalAuthMiddleware, eventController.listEvents);
router.get("/detail/:identifier", optionalAuthMiddleware, eventController.getEventBySlugOrId);
router.get("/:identifier", optionalAuthMiddleware, eventController.getEventBySlugOrId);

// User event RSVP
router.post(
  "/:id/register",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.registerForEvent
);

router.post(
  "/:id/register-paid",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.registerPaidForEvent
);

router.post(
  "/:id/attend",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.markAttendance
);

// Admin Event Management
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateRequest(validateCreateEvent),
  eventController.createEvent
);

router.get(
  "/:id/registrations",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.getEventRegistrations
);

router.get(
  "/:id/participants/pdf",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.downloadParticipantsPdf
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateEvent),
  eventController.updateEvent
);
router.put(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateEvent),
  eventController.updateEvent
);

router.post(
  "/:id/cover",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  upload.single("cover"),
  eventController.uploadCover
);

router.post(
  "/:id/poster",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  upload.single("poster"),
  eventController.uploadPoster
);

// BUG-055: real signature-image upload for Operations Centre certificate signatories
// (see event.controller.js uploadSignatoryImage for the full story).
router.post(
  "/:id/signatory-image",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  upload.single("image"),
  eventController.uploadSignatoryImage
);

// BUG-060: real Keynote 1/2 poster upload for Operations Centre My Team > Role Assignments
// (see event.controller.js uploadKeynotePoster for the full story).
router.post(
  "/:id/keynote-poster",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  upload.single("poster"),
  eventController.uploadKeynotePoster
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.deleteEvent
);

// RIFAH Operations Center Routes
router.get(
  "/:id/operations",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.getOperations
);

router.patch(
  "/:id/operations",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.updateOperations
);

router.patch(
  "/:id/attendees/:attendeeId/checkin",
  authMiddleware,
  requireEventRoleOrAdmin("entranceIncharge"),
  validateObjectIdParam("id"),
  eventController.toggleCheckin
);

router.patch(
  "/:id/attendees/:attendeeId/gate",
  authMiddleware,
  requireEventRoleOrAdmin("entranceIncharge"),
  validateObjectIdParam("id"),
  eventController.setGateStatus
);

router.post(
  "/:id/finance",
  authMiddleware,
  requireEventRoleOrAdmin("treasurer"),
  validateObjectIdParam("id"),
  eventController.addFinance
);

// ─── Event Role Assignments (functional roles → real access) ─────────────
router.patch(
  "/:id/role-assignments",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.assignRole
);

router.patch(
  "/:id/role-assignments/bulk",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.assignRolesBulk
);

router.get(
  "/:id/role-assignments",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.getRoleAssignments
);

router.get(
  "/:id/my-duty",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.getMyDuty
);

// ─── Ask & Give Routes ───────────────────────────────────────────────────
router.get(
  "/:id/ask-give-board",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.getAskGiveBoard
);

router.patch(
  "/:id/attendees/:attendeeId/ask-give",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.updateAttendeeAskGive
);

// ─── Event Scripts Routes ────────────────────────────────────────────────
router.get(
  "/:id/scripts",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.getScripts
);

router.patch(
  "/:id/scripts/:segmentId",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.updateScript
);

// ─── Certificates Routes ──────────────────────────────────────────────────
// BUG-041: previously restricted to Central/State/Chapter Admin only, so an
// attendee (or the public) could never view/download their own certificate.
// Any authenticated user may call this now; per-attendee authorization (admin,
// or the attendee viewing their own certificate) is enforced in the controller.
router.get(
  "/:id/certificates/:attendeeId",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.generateCertificate
);

export { router as eventRoutes };
export default router;

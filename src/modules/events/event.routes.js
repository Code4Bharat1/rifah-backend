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

const router = Router();

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
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.toggleCheckin
);

router.post(
  "/:id/finance",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.addFinance
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

// ─── Entrance Desk Routes ────────────────────────────────────────────────
router.patch(
  "/:id/attendees/:attendeeId/gate-action",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.gateAction
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
router.get(
  "/:id/certificates/:attendeeId",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  eventController.generateCertificate
);

export { router as eventRoutes };
export default router;

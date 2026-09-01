import { Router } from "express";
import { eventController } from "./event.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
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
router.get("/", eventController.listEvents);
router.get("/detail/:identifier", eventController.getEventBySlugOrId);
router.get("/:identifier", eventController.getEventBySlugOrId);

// User event RSVP
router.post(
  "/:id/register",
  authMiddleware,
  validateObjectIdParam("id"),
  eventController.registerForEvent
);

// Admin Event Management
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateRequest(validateCreateEvent),
  eventController.createEvent
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateEvent),
  eventController.updateEvent
);
router.put(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateEvent),
  eventController.updateEvent
);

router.post(
  "/:id/cover",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  upload.single("cover"),
  eventController.uploadCover
);

export { router as eventRoutes };
export default router;

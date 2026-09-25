import { Router } from "express";
import { chapterController } from "./chapter.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateCreateChapter,
  validateUpdateChapter,
  validateAddUnit,
  validateAssignChapterAdmin,
} from "./chapter.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public routes
router.get("/", optionalAuthMiddleware, chapterController.listChapters);
router.get("/slug/:slug", optionalAuthMiddleware, chapterController.getChapterBySlug);
// Admin / Detail routes
router.get(
  "/:id/details",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  chapterController.getChapterDetails
);

router.get("/:id", validateObjectIdParam("id"), chapterController.getChapterById);

// Admin routes (Super Admin and State Admin)
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateRequest(validateCreateChapter),
  chapterController.createChapter
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateChapter),
  chapterController.updateChapter
);

router.patch(
  "/:id/status",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateObjectIdParam("id"),
  chapterController.updateChapterStatus
);

router.post(
  "/:id/units",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateAddUnit),
  chapterController.addUnit
);

router.delete(
  "/:id/units/:unitId",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  chapterController.removeUnit
);

// Assign / Reallocate Chapter Admin (Central Admin or State Admin)
router.post(
  "/:id/admins",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateAssignChapterAdmin),
  chapterController.assignAdmin
);

// Revoke Chapter Admin
router.delete(
  "/:id/admins",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateObjectIdParam("id"),
  chapterController.removeAdmin
);

// Delete Chapter
router.delete(
  "/:id",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  validateObjectIdParam("id"),
  chapterController.deleteChapter
);

export { router as chapterRoutes };
export default router;

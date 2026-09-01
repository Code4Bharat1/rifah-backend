import { Router } from "express";
import { chapterController } from "./chapter.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateCreateChapter,
  validateUpdateChapter,
  validateAddUnit,
} from "./chapter.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public routes
router.get("/", chapterController.listChapters);
router.get("/slug/:slug", chapterController.getChapterBySlug);
router.get("/:id", validateObjectIdParam("id"), chapterController.getChapterById);

// Admin routes
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateRequest(validateCreateChapter),
  chapterController.createChapter
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateChapter),
  chapterController.updateChapter
);

router.post(
  "/:id/units",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateAddUnit),
  chapterController.addUnit
);

router.delete(
  "/:id/units/:unitId",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  chapterController.removeUnit
);

export { router as chapterRoutes };
export default router;

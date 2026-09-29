import { Router } from "express";
import { thankYouNoteController } from "./thank-you-note.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  thankYouNoteController.create
);

router.get(
  "/me",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  thankYouNoteController.listMine
);

router.get(
  "/summary/me",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  thankYouNoteController.summaryForMe
);

router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  thankYouNoteController.listForAdmin
);

router.get("/:id", authMiddleware, validateObjectIdParam("id"), thankYouNoteController.getById);

export { router as thankYouNoteRoutes };
export default router;

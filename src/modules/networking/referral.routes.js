import { Router } from "express";
import { referralController } from "./referral.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  referralController.create
);

router.get(
  "/me",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  referralController.listMine
);

router.post(
  "/:id/close",
  authMiddleware,
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  validateObjectIdParam("id"),
  referralController.close
);

router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  referralController.listForAdmin
);

router.get("/:id", authMiddleware, validateObjectIdParam("id"), referralController.getById);

export { router as referralRoutes };
export default router;

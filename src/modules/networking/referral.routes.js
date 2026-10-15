import { Router } from "express";
import { referralController } from "./referral.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

const MEMBER_ROLES = [
  ROLES.BUSINESS_OWNER,
  ROLES.CUSTOMER,
  ROLES.BUYER,
  ROLES.CHAPTER_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.CENTRAL_ADMIN,
  ROLES.COUNTRY_ADMIN,
];

router.post(
  "/",
  authMiddleware,
  requireRole(...MEMBER_ROLES),
  referralController.create
);

router.get(
  "/me",
  authMiddleware,
  requireRole(...MEMBER_ROLES),
  referralController.listMine
);

router.post(
  "/:id/close",
  authMiddleware,
  requireRole(...MEMBER_ROLES),
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

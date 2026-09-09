import { Router } from "express";
import { membershipController } from "./membership.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateUpgradePlan } from "./membership.validation.js";

import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public plan catalog
router.get("/plans", membershipController.getPlans);

// Admin plan management (Restricted to Super Admin & Secretariat)
router.post("/plans", authMiddleware, requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT), membershipController.createPlan);
router.put("/plans/:planId", authMiddleware, requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT), membershipController.updatePlan);
router.delete("/plans/:planId", authMiddleware, requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT), membershipController.deletePlan);

// Business Owner membership management
router.get("/me", authMiddleware, membershipController.getMyMembership);
router.get("/my", authMiddleware, membershipController.getMyMembership);
router.post(
  "/upgrade",
  authMiddleware,
  validateRequest(validateUpgradePlan),
  membershipController.upgradePlan
);

export { router as membershipRoutes };
export default router;

import { Router } from "express";
import { membershipController } from "./membership.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateUpgradePlan } from "./membership.validation.js";

const router = Router();

// Public plan catalog
router.get("/plans", membershipController.getPlans);

// Admin plan management (Skipping admin role middleware for now to match current platform simplicity)
router.post("/plans", authMiddleware, membershipController.createPlan);
router.put("/plans/:planId", authMiddleware, membershipController.updatePlan);
router.delete("/plans/:planId", authMiddleware, membershipController.deletePlan);

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

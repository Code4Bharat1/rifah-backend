import { Router } from "express";
import { analyticsController } from "./analytics.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public — no auth required, for the landing page
router.get("/public/states", analyticsController.publicStateTotals);

// Admin-only, role-scoped
router.get(
  "/overview",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  analyticsController.overview
);

router.get(
  "/leaderboard",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  analyticsController.leaderboard
);

router.get(
  "/breakdown",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN),
  analyticsController.breakdown
);

export { router as networkingAnalyticsRoutes };
export default router;

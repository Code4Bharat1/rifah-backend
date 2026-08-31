import { Router } from "express";
import { reportController } from "./report.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Business Owner Analytics
router.get("/business/me", authMiddleware, reportController.getBusinessAnalytics);

// Admin Secretariat Chamber-wide KPIs
router.get(
  "/admin/overview",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.getAdminOverview
);

export { router as reportRoutes };
export default router;

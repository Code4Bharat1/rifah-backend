import { Router } from "express";
import { reportController } from "./report.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Business Owner Analytics
router.get("/business/me", authMiddleware, reportController.getBusinessAnalytics);
router.get("/business-analytics", authMiddleware, reportController.getBusinessAnalytics);

// Admin Secretariat Chamber-wide KPIs
router.get(
  "/overview",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.getAdminOverview
);
router.get(
  "/admin/overview",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.getAdminOverview
);

router.get(
  "/admin/export/csv",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.exportAdminCsv
);

router.get(
  "/admin/export/revenue",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.exportRevenue
);

router.get(
  "/admin/export/memberships",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.exportMemberships
);

router.get(
  "/admin/export/leads",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  reportController.exportLeads
);

export { router as reportRoutes };
export default router;

import { Router } from "express";
import { googleDriveController } from "./google-drive.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

const ALL_ADMIN_ROLES = [
  ROLES.CENTRAL_ADMIN,
  ROLES.SECRETARIAT,
  ROLES.COUNTRY_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.CHAPTER_ADMIN,
  "super_admin",
  "admin",
];

const CENTRAL_ADMIN_ROLES = [
  ROLES.CENTRAL_ADMIN,
  ROLES.SECRETARIAT,
  "super_admin",
  "admin",
];

// OAuth Callback route (handles Google redirect)
router.get("/oauth-callback", googleDriveController.handleOAuthCallback);

// Status route for authorized administrators
router.get(
  "/status",
  authMiddleware,
  requireRole(...ALL_ADMIN_ROLES),
  googleDriveController.getStatus
);

// Auth URL generation (Central Admin only)
router.get(
  "/auth-url",
  authMiddleware,
  requireRole(...CENTRAL_ADMIN_ROLES),
  googleDriveController.getAuthUrl
);

// Disconnect Google Drive (Central Admin only)
router.post(
  "/disconnect",
  authMiddleware,
  requireRole(...CENTRAL_ADMIN_ROLES),
  googleDriveController.disconnect
);

// Trigger manual synchronization of spreadsheets
router.post(
  "/sync",
  authMiddleware,
  requireRole(...ALL_ADMIN_ROLES),
  googleDriveController.triggerSync
);

// Force reconciliation of Admin Drive Permissions (Central Admin only)
router.post(
  "/sync-permissions",
  authMiddleware,
  requireRole(...CENTRAL_ADMIN_ROLES),
  googleDriveController.syncPermissions
);

// View synchronization logs
router.get(
  "/logs",
  authMiddleware,
  requireRole(...ALL_ADMIN_ROLES),
  googleDriveController.getLogs
);

// Retry failed synchronization tasks
router.post(
  "/retry-failed",
  authMiddleware,
  requireRole(...ALL_ADMIN_ROLES),
  googleDriveController.retryFailed
);

// Download locally cached Excel workbook
router.get(
  "/download/:type",
  authMiddleware,
  requireRole(...ALL_ADMIN_ROLES),
  googleDriveController.downloadLocal
);

export const googleDriveRoutes = router;
export default googleDriveRoutes;

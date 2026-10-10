import { Router } from "express";
import { settingsController } from "./settings.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public read endpoint so contact page and public forms can access platform chamber details
router.get("/", settingsController.getSettings);
router.get("/public", settingsController.getSettings);

// BUG-064: this route let State/Chapter Admin PATCH organisation-wide settings (fees,
// catalogue limits, chamber details, etc.) via the API even though the frontend already
// hid the settings form from them — only Central Admin should actually be able to.
router.patch(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  settingsController.updateSettings
);

export { router as settingsRoutes };
export default router;

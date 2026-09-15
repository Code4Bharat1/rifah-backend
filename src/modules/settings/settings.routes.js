import { Router } from "express";
import { settingsController } from "./settings.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public read endpoint so contact page and public forms can access platform chamber details
router.get("/", settingsController.getSettings);
router.get("/public", settingsController.getSettings);

router.patch(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  settingsController.updateSettings
);

export { router as settingsRoutes };
export default router;

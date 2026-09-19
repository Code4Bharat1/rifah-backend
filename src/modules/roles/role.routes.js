import { Router } from "express";
import { roleController } from "./role.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public route for the directory page
router.get("/public", roleController.getPublicRoles);

// Admin-only routes
router.use(authMiddleware);
router.use(requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN));

router.get("/", roleController.getAllRoles);
router.post("/", roleController.createRole);
router.put("/:id", roleController.updateRole);
router.delete("/:id", roleController.deleteRole);

export { router as roleRoutes };

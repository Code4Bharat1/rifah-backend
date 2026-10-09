import { Router } from "express";
import { rolePermissionTemplateController } from "./role-permission-template.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// All routes require authentication and at least chapter_admin
router.use(authMiddleware);
router.use(requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN, "secretariat"));

router.get("/", rolePermissionTemplateController.list);
router.get("/:id", rolePermissionTemplateController.getById);
router.post("/", rolePermissionTemplateController.create);
router.put("/:id", rolePermissionTemplateController.update);
router.delete("/:id", rolePermissionTemplateController.delete);

export { router as rolePermissionTemplateRoutes };

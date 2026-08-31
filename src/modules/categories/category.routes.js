import { Router } from "express";
import { categoryController } from "./category.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateCreateCategory, validateUpdateCategory } from "./category.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public routes
router.get("/", categoryController.listCategories);
router.get("/slug/:slug", categoryController.getCategoryBySlug);

// Admin routes
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateRequest(validateCreateCategory),
  categoryController.createCategory
);

router.patch(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  validateRequest(validateUpdateCategory),
  categoryController.updateCategory
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  categoryController.deleteCategory
);

export { router as categoryRoutes };
export default router;

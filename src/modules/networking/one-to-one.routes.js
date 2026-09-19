import { Router } from "express";
import { oneToOneController } from "./one-to-one.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.post("/", authMiddleware, requireRole(ROLES.BUSINESS_OWNER), oneToOneController.create);

router.get("/me", authMiddleware, requireRole(ROLES.BUSINESS_OWNER), oneToOneController.listMine);

router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  oneToOneController.listForAdmin
);

router.get("/:id", authMiddleware, validateObjectIdParam("id"), oneToOneController.getById);

export { router as oneToOneRoutes };
export default router;

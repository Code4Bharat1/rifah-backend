import { Router } from "express";
import { queryController } from "./query.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public route to submit a query from contact page
router.post("/", queryController.create);

// Protected routes for Chapter Admins, Secretariat, and Super Admin
router.use(authMiddleware);
router.use(requireRole(ROLES.CHAPTER_ADMIN, ROLES.SECRETARIAT, ROLES.SUPER_ADMIN));

router.get("/", queryController.list);
router.patch("/:id/reply", queryController.reply);

export { router as queryRoutes };
export default router;

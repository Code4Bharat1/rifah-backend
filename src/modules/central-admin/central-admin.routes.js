import { Router } from "express";
import { centralAdminController } from "./central-admin.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Only the current Central Admin may view or transfer the role — this is the
// only path (besides the one-time CLI seed script) that a user can end up
// with role: "central_admin", and it always requires the caller to already
// hold it, so a first Central Admin must be bootstrapped via the seed script.
router.get("/", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN), centralAdminController.getCurrent);
router.post("/transfer", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN), centralAdminController.transfer);

export { router as centralAdminRoutes };
export default router;

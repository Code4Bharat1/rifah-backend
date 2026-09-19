import { Router } from "express";
import { stateController } from "./state.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Upload State Image
router.post(
  "/upload",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  upload.single("image"),
  stateController.uploadImage
);

// Super Admin and State Admin can view states
router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  stateController.listStates
);

router.get(
  "/:stateName",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  stateController.getStateByName
);

// ONLY Super Admin can allocate State Admins
router.post(
  "/assign-admin",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  stateController.assignStateAdmin
);

// ONLY Super Admin can revoke a State Admin
router.delete(
  "/:stateName/admin",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  stateController.removeStateAdmin
);

// Edit State (Rename globally)
router.put(
  "/:stateName",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  stateController.updateState
);

// Delete State (Safe Detachment)
router.delete(
  "/:stateName",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  stateController.deleteState
);

// Edit State Profile
router.put(
  "/:stateName/profile",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN),
  stateController.updateStateProfile
);

export { router as stateRoutes };
export default router;

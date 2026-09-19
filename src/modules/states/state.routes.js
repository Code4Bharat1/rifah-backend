import { Router } from "express";
import { stateController } from "./state.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
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

// Public route to view states (filtered by requester role if authenticated)
router.get(
  "/",
  optionalAuthMiddleware,
  stateController.listStates
);

// Create State manually
router.post(
  "/",
  authMiddleware,
  requireRole(ROLES.CENTRAL_ADMIN),
  stateController.createState
);

router.get(
  "/:stateName",
  optionalAuthMiddleware,
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

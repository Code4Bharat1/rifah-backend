import { Router } from "express";
import { verificationController } from "./verification.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  validateSubmitVerification,
  validateReviewVerification,
} from "./verification.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Business Owner Routes
router.post(
  "/submit",
  authMiddleware,
  validateRequest(validateSubmitVerification),
  verificationController.submitVerification
);

router.post(
  "/upload",
  authMiddleware,
  upload.single("document"),
  verificationController.uploadDocument
);

router.get(
  "/business/:businessId",
  authMiddleware,
  validateObjectIdParam("businessId"),
  verificationController.getVerificationStatus
);

// Admin Secretariat Verification Queue
router.get(
  "/queue",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  verificationController.listVerifications
);

router.patch(
  "/:id/review",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  validateRequest(validateReviewVerification),
  verificationController.reviewVerification
);

export { router as verificationRoutes };
export default router;

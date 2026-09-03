import { Router } from "express";
import { enquiryController } from "./enquiry.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateCreateEnquiry,
  validateUpdateEnquiryStatus,
} from "./enquiry.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public / Buyer routes (guest posting allowed conditionally)
router.post(
  "/",
  optionalAuthMiddleware,
  validateRequest(validateCreateEnquiry),
  enquiryController.createEnquiry
);

router.get("/me", authMiddleware, enquiryController.getMyEnquiries);
router.get("/:id", authMiddleware, enquiryController.getEnquiryById);

// Admin chamber-wide enquiry monitoring
router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  enquiryController.listAllEnquiries
);
router.get(
  "/admin/all",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  enquiryController.listAllEnquiries
);

router.patch(
  "/:id/status",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateRequest(validateUpdateEnquiryStatus),
  enquiryController.updateEnquiryStatus
);

export { router as enquiryRoutes };
export default router;

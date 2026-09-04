import { Router } from "express";
import { businessController } from "./business.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import {
  validateCreateBusiness,
  validateUpdateBusiness,
} from "./business.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public directory & verification routes
router.get("/", optionalAuthMiddleware, businessController.searchDirectory);
router.get("/detail/:identifier", optionalAuthMiddleware, businessController.getBusinessByIdOrSlug);
router.post("/gst/verify", businessController.verifyGst);
router.post("/gst/details", businessController.getGstDetails);

// Authenticated Business Owner routes
router.get("/me", authMiddleware, businessController.getMyBusiness);
router.get("/:identifier", businessController.getBusinessByIdOrSlug);
router.post(
  "/",
  authMiddleware,
  validateRequest(validateCreateBusiness),
  businessController.createBusiness
);
router.put(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateUpdateBusiness),
  businessController.updateBusiness
);
router.patch(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateUpdateBusiness),
  businessController.updateBusiness
);
router.put(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateUpdateBusiness),
  businessController.updateBusiness
);

// File upload endpoints (direct local server storage)
router.post(
  "/:id/logo",
  authMiddleware,
  validateObjectIdParam("id"),
  upload.single("logo"),
  businessController.uploadLogo
);
router.post(
  "/:id/cover",
  authMiddleware,
  validateObjectIdParam("id"),
  upload.single("cover"),
  businessController.uploadCover
);
router.post(
  "/:id/gallery",
  authMiddleware,
  validateObjectIdParam("id"),
  upload.array("gallery", 10),
  businessController.uploadGallery
);
router.post(
  "/:id/certificates",
  authMiddleware,
  validateObjectIdParam("id"),
  upload.single("certificate"),
  businessController.uploadCertificate
);

// Admin moderation
router.patch(
  "/:id/status",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  validateObjectIdParam("id"),
  businessController.updateStatus
);

export { router as businessRoutes };
export default router;

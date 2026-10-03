import { Router } from "express";
import { advertisementController } from "./advertisement.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateCreateAdvertisement,
  validateReviewAdvertisement,
} from "./advertisement.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Protect all advertisement routes with auth
router.use(authMiddleware);

// 1. Live Active Ads for Dashboard Banner Carousel (Global + State + Chapter)
router.get("/active", advertisementController.getActiveAdvertisements);

// 2. Calendar slots with privacy masking (supports ?targetScope=chapter|state|global)
router.get("/calendar", advertisementController.getCalendarSlots);

// 3. Businessman's own ads
router.get("/my", advertisementController.getMyAdvertisements);

// 4. Create & Submit Ad (with multipart banner upload support and schema validation)
router.post(
  "/",
  upload.fields([
    { name: "banner", maxCount: 1 },
    { name: "bannerImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateRequest(validateCreateAdvertisement),
  advertisementController.createAdvertisement
);

// 5. Unified Admin Verification Queue (Chapter Admin, State Admin, Central Admin)
router.get(
  "/admin/list",
  requireRole(ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  advertisementController.getAdminAdvertisements
);

// Backward-compatible alias for Chapter Admin
router.get(
  "/chapter-admin",
  requireRole(ROLES.CHAPTER_ADMIN, ROLES.CENTRAL_ADMIN),
  advertisementController.getChapterAdvertisements
);

// 6. Admin Review / Verification Action with schema validation
router.patch(
  "/:id/review",
  requireRole(ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.CENTRAL_ADMIN),
  validateRequest(validateReviewAdvertisement),
  advertisementController.reviewAdvertisement
);

// 7. Delete / Cancel
router.delete("/:id", advertisementController.deleteAdvertisement);

export { router as advertisementRoutes };
export default router;

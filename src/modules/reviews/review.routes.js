import { Router } from "express";
import { reviewController } from "./review.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateSubmitReview,
  validateModerateReview,
} from "./review.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public: View business reviews
router.get(
  "/business/:businessId",
  validateObjectIdParam("businessId"),
  reviewController.listBusinessReviews
);

// Public / Authenticated: Submit review (guests or members)
router.post(
  "/",
  optionalAuthMiddleware,
  validateRequest(validateSubmitReview),
  reviewController.submitReview
);

// Admin: Moderate reviews
router.get(
  "/admin/all",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  reviewController.listReviewsForAdmin
);

router.patch(
  "/:id/moderate",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  validateRequest(validateModerateReview),
  reviewController.moderateReview
);

router.delete(
  "/admin/all",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  reviewController.deleteAllReviews
);

router.delete(
  "/:id",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN),
  validateObjectIdParam("id"),
  reviewController.deleteReview
);

export { router as reviewRoutes };
export default router;

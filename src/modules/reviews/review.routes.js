import { Router } from "express";
import { reviewController } from "./review.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateSubmitReview } from "./review.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";

const router = Router();

// Public: View business reviews
router.get(
  "/business/:businessId",
  validateObjectIdParam("businessId"),
  reviewController.listBusinessReviews
);

// Authenticated: Submit review (Direct display, auto-published)
router.post(
  "/",
  authMiddleware,
  validateRequest(validateSubmitReview),
  reviewController.submitReview
);

// Authenticated: Delete review (Business Owner only - Admin has no permission)
router.delete(
  "/:id",
  authMiddleware,
  validateObjectIdParam("id"),
  reviewController.deleteReview
);

// Authenticated: Business Owner replies to review
router.post(
  "/:id/reply",
  authMiddleware,
  validateObjectIdParam("id"),
  reviewController.replyToReview
);

export { router as reviewRoutes };
export default router;

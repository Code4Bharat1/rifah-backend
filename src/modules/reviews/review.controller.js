import { reviewService } from "./review.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const reviewController = {
  submitReview: asyncHandler(async (req, res) => {
    const review = await reviewService.submitReview(req.body, req.user);
    return ApiResponse.created(
      res,
      review,
      "Review submitted successfully and sent for moderation"
    );
  }),

  listBusinessReviews: asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { reviews, meta } = await reviewService.listBusinessReviews(businessId, req.query);
    return ApiResponse.success(res, reviews, "Business reviews retrieved", 200, meta);
  }),

  listReviewsForAdmin: asyncHandler(async (req, res) => {
    const { reviews, meta } = await reviewService.listReviewsForAdmin(req.query);
    return ApiResponse.success(res, reviews, "Reviews retrieved for moderation", 200, meta);
  }),

  moderateReview: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const review = await reviewService.moderateReview(id, req.body, req.user.id);
    return ApiResponse.success(res, review, `Review ${review.status} successfully`);
  }),
};

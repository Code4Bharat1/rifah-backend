import { Review } from "./review.model.js";
import { Business } from "../businesses/business.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ConflictError } from "../../shared/errors/errors.js";

export const reviewService = {
  /**
   * Submit review for a business (Buyer / Customer)
   */
  submitReview: async (data, user) => {
    const business = await Business.findById(data.businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    const existing = await Review.findOne({ business: data.businessId, author: user.id });
    if (existing) {
      throw new ConflictError("You have already submitted a review for this business");
    }

    return Review.create({
      business: data.businessId,
      author: user.id,
      authorName: user.name || "Verified Member",
      rating: data.rating,
      title: data.title || "",
      body: data.body.trim(),
      status: "pending",
    });
  },

  /**
   * List approved reviews for a business
   */
  listBusinessReviews: async (businessId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { business: businessId, status: "approved" };

    const [reviews, total] = await Promise.all([
      Review.find(filter).sort(sort).skip(skip).limit(limit),
      Review.countDocuments(filter),
    ]);

    return {
      reviews,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * List all reviews for moderation (Admin)
   */
  listReviewsForAdmin: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) filter.status = queryParams.status;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("business", "name slug chapter")
        .populate("author", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    return {
      reviews,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Moderate review (Admin: approve/reject)
   */
  moderateReview: async (reviewId, { status }, adminId) => {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new NotFoundError("Review not found");
    }

    review.status = status;
    review.moderatedBy = adminId;
    review.moderatedAt = new Date();
    await review.save();

    // Recalculate average rating for the business if approved
    if (status === "approved") {
      const approvedReviews = await Review.find({
        business: review.business,
        status: "approved",
      });
      const totalRating = approvedReviews.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = (totalRating / approvedReviews.length).toFixed(1);

      await Business.findByIdAndUpdate(review.business, {
        rating: Number(avgRating),
        reviewsCount: approvedReviews.length,
      });
    }

    return review;
  },
};

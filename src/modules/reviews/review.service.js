import { Review } from "./review.model.js";
import { Business } from "../businesses/business.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, ConflictError } from "../../shared/errors/errors.js";

export const reviewService = {
  /**
   * Recalculate average rating and reviewsCount on Business model
   */
  recalculateRating: async (businessId) => {
    const reviews = await Review.find({
      business: businessId,
      status: { $in: ["approved", "published", "pending"] },
    });
    const count = reviews.length;
    let avg = 5.0;
    if (count > 0) {
      const sum = reviews.reduce((acc, r) => acc + (r.rating || 5), 0);
      avg = Number((sum / count).toFixed(1));
    }
    await Business.findByIdAndUpdate(businessId, {
      rating: avg,
      reviewsCount: count,
    });
    return { rating: avg, reviewsCount: count };
  },

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
      existing.rating = data.rating;
      existing.title = data.title || "";
      existing.body = data.body.trim();
      existing.status = "approved";
      await existing.save();

      await reviewService.recalculateRating(data.businessId);
      return existing;
    }

    const review = await Review.create({
      business: data.businessId,
      author: user.id,
      authorName: user.name || "Verified Member",
      authorRole: user.role === "business" ? "Chamber Business Member" : "Verified Buyer",
      rating: data.rating,
      title: data.title || "",
      body: data.body.trim(),
      status: "approved",
    });

    await reviewService.recalculateRating(data.businessId);

    return review;
  },

  /**
   * List approved & published reviews for a business
   */
  listBusinessReviews: async (businessId, queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {
      business: businessId,
      status: { $in: ["approved", "published", "pending"] },
    };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("author", "name email role")
        .sort(sort || { createdAt: -1 })
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

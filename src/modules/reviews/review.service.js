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
    let avg = 0;
    if (count > 0) {
      const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      avg = Number((sum / count).toFixed(1));
    }
    const updatedBiz = await Business.findByIdAndUpdate(
      businessId,
      {
        rating: avg,
        reviewsCount: count,
      },
      { new: true }
    );
    return { rating: avg, reviewsCount: count, business: updatedBiz };
  },

  /**
   * Submit review for a business (Buyer / Customer)
   */
  submitReview: async (data, user) => {
    const business = await Business.findById(data.businessId);
    if (!business) {
      throw new NotFoundError("Business not found");
    }

    if (user && user.id) {
      const existing = await Review.findOne({ business: data.businessId, author: user.id });
      if (existing) {
        existing.rating = Number(data.rating) || 5;
        existing.title = data.title || "";
        existing.body = data.body.trim();
        existing.status = "approved";
        await existing.save();

        const stats = await reviewService.recalculateRating(data.businessId);
        return { ...existing.toObject(), stats };
      }
    }

    const review = await Review.create({
      business: data.businessId,
      author: user?.id || null,
      authorName: user?.name || data.authorName || "Guest Reviewer",
      authorRole: user?.role === "business" ? "Chamber Business Member" : (user ? "Verified Member" : "Guest Reviewer"),
      rating: Number(data.rating) || 5,
      title: data.title || "",
      body: data.body.trim(),
      status: "approved",
    });

    const stats = await reviewService.recalculateRating(data.businessId);

    return { ...review.toObject(), stats };
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

    await reviewService.recalculateRating(review.business);

    return review;
  },

  /**
   * Delete review (Admin)
   */
  deleteReview: async (reviewId) => {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new NotFoundError("Review not found");
    }

    const businessId = review.business;
    await Review.findByIdAndDelete(reviewId);
    await reviewService.recalculateRating(businessId);

    return { message: "Review deleted successfully" };
  },

  /**
   * Delete all reviews (Admin)
   */
  deleteAllReviews: async (queryParams = {}) => {
    const filter = {};
    if (queryParams.status && queryParams.status !== "all") {
      filter.status = queryParams.status;
    }

    const affectedBusinesses = await Review.distinct("business", filter);
    const result = await Review.deleteMany(filter);

    // Recalculate ratings for all affected businesses
    await Promise.all(
      affectedBusinesses.map((bId) => reviewService.recalculateRating(bId))
    );

    return { deletedCount: result.deletedCount };
  },
};

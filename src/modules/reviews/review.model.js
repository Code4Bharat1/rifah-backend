import mongoose from "mongoose";
import { STATUSES } from "../../shared/constants/statuses.js";

const reviewSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    authorRole: {
      type: String,
      default: "Verified Buyer",
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    body: {
      type: String,
      required: [true, "Review text is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.REVIEW),
      default: STATUSES.REVIEW.PENDING,
      index: true,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

reviewSchema.index({ business: 1, author: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);
export default Review;

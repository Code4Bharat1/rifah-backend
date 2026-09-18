import mongoose from "mongoose";

const courseProgressSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    completedContents: [
      {
        contentId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        watchedAt: {
          type: Date,
          default: Date.now,
        },
      }
    ],
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a business can only have one progress record per course
courseProgressSchema.index({ businessId: 1, courseId: 1 }, { unique: true });

export const CourseProgress = mongoose.model("CourseProgress", courseProgressSchema);
export default CourseProgress;

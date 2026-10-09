 import mongoose from "mongoose";

const courseContentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["video", "pdf"],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    required: true,
  }
});

const courseChapterSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  order: {
    type: Number,
    default: 1,
  },
  contents: [courseContentSchema],
});

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scope: {
      type: String,
      enum: ["centre", "state", "chapter", "business"],
      required: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
    },
    chapters: [courseChapterSchema],
    contents: [courseContentSchema],
    isActive: {
      type: Boolean,
      default: false, // Starts as inactive; published only after approval (for non-central) or directly by central admin
    },
    // ── Approval Workflow ──────────────────────────────────────────────────────
    // Non-central-admin courses require Central Admin approval before going live.
    // Central Admin courses are set to "not_required" and can be published directly.
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "not_required"],
      default: "pending",
      index: true,
    },
    approvalRemark: {
      type: String,
      default: "",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    // ── Paid Course (Central Admin Only) ─────────────────────────────────────
    // Only Central Admin can create paid courses.
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    // Tracks businesses/users who have paid and enrolled in this course
    enrollments: [
      {
        businessId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Business",
          default: null,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        paymentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Payment",
          default: null,
        },
        enrolledAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Course = mongoose.model("Course", courseSchema);
export default Course;

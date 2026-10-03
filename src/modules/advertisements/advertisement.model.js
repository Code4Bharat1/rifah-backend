import mongoose from "mongoose";

const advertisementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Advertisement title is required"],
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    bannerImage: {
      type: String,
      required: [true, "Banner image is required"],
    },
    linkUrl: {
      type: String,
      trim: true,
      default: "",
    },
    // Business association
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Chapter association (optional for global/state campaigns, validated at service level for chapter campaigns)
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    chapterName: {
      type: String,
      default: "",
    },
    // Audience / Target Scope: 'chapter' | 'state' | 'global'
    targetScope: {
      type: String,
      enum: ["chapter", "state", "global"],
      default: "chapter",
      index: true,
    },
    // State association (auto-derived from Chapter/Business)
    state: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    // Scheduling & Approval
    requestedDate: {
      type: Date,
      required: true,
    },
    approvedStartDate: {
      type: Date,
      default: null,
      index: true,
    },
    approvedEndDate: {
      type: Date,
      default: null,
      index: true,
    },
    durationDays: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Active", "Queued", "Completed", "Rejected"],
      default: "Pending",
      index: true,
    },
    queuePosition: {
      type: Number,
      default: 0,
    },
    adminRemarks: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for fast queries on live / queued ads across scopes
advertisementSchema.index({ targetScope: 1, chapterId: 1, status: 1, approvedStartDate: 1, approvedEndDate: 1 });
advertisementSchema.index({ targetScope: 1, state: 1, status: 1, approvedStartDate: 1, approvedEndDate: 1 });
advertisementSchema.index({ targetScope: 1, status: 1, approvedStartDate: 1, approvedEndDate: 1 });
advertisementSchema.index({ status: 1, approvedStartDate: 1, approvedEndDate: 1 });

export const Advertisement = mongoose.model("Advertisement", advertisementSchema);
export default Advertisement;

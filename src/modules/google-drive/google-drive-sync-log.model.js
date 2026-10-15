import mongoose from "mongoose";

const googleDriveSyncLogSchema = new mongoose.Schema(
  {
    taskType: {
      type: String,
      enum: ["spreadsheet_sync", "permission_sync", "full_sync", "file_upload"],
      required: true,
      index: true,
    },
    target: {
      type: String,
      enum: [
        "businesses",
        "users",
        "revenue_sharing",
        "event_attendees",
        "permissions",
        "all",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "success", "failed"],
      default: "pending",
      index: true,
    },
    trigger: {
      type: String,
      enum: ["event_hook", "manual", "cron", "retry", "oauth_connect"],
      default: "event_hook",
      index: true,
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    errorDetails: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

googleDriveSyncLogSchema.index({ status: 1, createdAt: -1 });
googleDriveSyncLogSchema.index({ target: 1, status: 1 });

export const GoogleDriveSyncLog = mongoose.model(
  "GoogleDriveSyncLog",
  googleDriveSyncLogSchema
);
export default GoogleDriveSyncLog;

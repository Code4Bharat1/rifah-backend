import mongoose from "mongoose";

const fileLinkSchema = new mongoose.Schema(
  {
    fileId: { type: String, default: "" },
    fileName: { type: String, default: "" },
    webViewLink: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: null },
    rowCount: { type: Number, default: 0 },
    fileSize: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "synced", "failed"], default: "pending" },
    errorMessage: { type: String, default: "" },
  },
  { _id: false }
);

const syncedAdminSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    role: { type: String, required: true },
    chapter: { type: String, default: "" },
    state: { type: String, default: "" },
    permissionId: { type: String, default: "" },
    accessRole: { type: String, enum: ["writer", "reader", "commenter"], default: "writer" },
    status: { type: String, enum: ["synced", "failed", "revoked", "pending"], default: "pending" },
    syncedAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },
  { _id: true }
);

const googleDriveSettingsSchema = new mongoose.Schema(
  {
    isSingleton: {
      type: String,
      default: "global",
      unique: true,
      index: true,
    },
    isConnected: {
      type: Boolean,
      default: false,
      index: true,
    },
    googleEmail: {
      type: String,
      default: "",
    },
    googleDisplayName: {
      type: String,
      default: "",
    },
    googleAvatar: {
      type: String,
      default: "",
    },
    refreshToken: {
      type: String,
      default: "",
      select: false, // Hidden from regular queries
    },
    accessToken: {
      type: String,
      default: "",
      select: false,
    },
    tokenExpiry: {
      type: Date,
      default: null,
    },
    folderId: {
      type: String,
      default: "",
    },
    folderName: {
      type: String,
      default: "RIFAH Central Administration Archive",
    },
    folderWebViewLink: {
      type: String,
      default: "",
    },
    syncedAdmins: [syncedAdminSchema],
    fileLinks: {
      businesses: {
        type: fileLinkSchema,
        default: () => ({
          fileName: "RIFAH_Businesses.xlsx",
        }),
      },
      users: {
        type: fileLinkSchema,
        default: () => ({
          fileName: "RIFAH_Users.xlsx",
        }),
      },
      revenueSharing: {
        type: fileLinkSchema,
        default: () => ({
          fileName: "RIFAH_Revenue_Sharing.xlsx",
        }),
      },
      eventAttendees: {
        type: fileLinkSchema,
        default: () => ({
          fileName: "RIFAH_Event_Attendees.xlsx",
        }),
      },
    },
    autoSyncEnabled: {
      type: Boolean,
      default: true,
    },
    lastFullSyncAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export const GoogleDriveSettings = mongoose.model(
  "GoogleDriveSettings",
  googleDriveSettingsSchema
);
export default GoogleDriveSettings;

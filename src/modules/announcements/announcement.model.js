import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Announcement title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Announcement message is required"],
    },
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Published", "Archived"],
      default: "Draft",
      index: true,
    },
    chapter: {
      type: String,
      required: [true, "Chapter is required"],
      trim: true,
      index: true,
    },
    country: {
      type: String,
      default: "India",
      trim: true,
      index: true,
    },
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      default: null,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    broadcastId: {
      type: String,
      default: "",
    },
    scheduledAt: {
      type: Date,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.index({ countryId: 1, status: 1, createdAt: -1 });
announcementSchema.index({ country: 1, status: 1, createdAt: -1 });

export const Announcement = mongoose.model("Announcement", announcementSchema);
export default Announcement;

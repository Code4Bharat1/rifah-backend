import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ENUMS.NOTIFICATION_TYPES,
      default: "System",
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    body: {
      type: String,
      required: [true, "Notification body is required"],
    },
    entityId: {
      type: String,
      default: "", // e.g. Lead ID, Enquiry ID, Event ID
    },
    link: {
      type: String,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    broadcastId: {
      type: String,
      index: true,
    },
    eventDate: {
      type: String,
      default: "",
    },
    eventCity: {
      type: String,
      default: "",
    },
    eventTime: {
      type: String,
      default: "",
    },
    eventVenue: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Scaled for 10k users: compound indexes for instant sorting, lookup, and unread badges
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ broadcastId: 1 });

export const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;

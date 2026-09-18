import mongoose from "mongoose";

const followupSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["event", "membership"],
      required: true,
      default: "event",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    company: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "contacted",
        "interested",
        "completed",
        "not_interested",
        "overdue",
        "expiring_soon",
        "expired",
        "renewed",
      ],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    category: {
      type: String,
      default: "Attendee",
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    chapter: {
      type: String,
      trim: true,
      default: "Central Mumbai",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
    },
    lastContactedAt: {
      type: Date,
    },
    scheduledAt: {
      type: Date,
    },
    nextFollowUpAt: {
      type: Date,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notes: [
      {
        content: { type: String, required: true },
        author: { type: String, default: "Admin" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    messageHistory: [
      {
        channel: { type: String, enum: ["whatsapp", "sms", "email", "call"], default: "whatsapp" },
        message: { type: String },
        sentAt: { type: Date, default: Date.now },
        status: { type: String, default: "sent" },
      },
    ],
    history: [
      {
        contactedAt: { type: Date, default: Date.now },
        contactedBy: { type: String, default: "Admin" },
        method: {
          type: String,
          enum: ["call", "whatsapp", "email", "in_person", "sms", "note"],
          default: "call",
        },
        message: { type: String, default: "" },
        notes: { type: String, default: "" },
        status: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

followupSchema.index({ type: 1, status: 1 });
followupSchema.index({ event: 1 });
followupSchema.index({ chapter: 1 });
followupSchema.index({ mobile: 1 });

export const Followup = mongoose.model("Followup", followupSchema);

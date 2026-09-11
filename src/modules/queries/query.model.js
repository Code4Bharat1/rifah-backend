import mongoose from "mongoose";

const querySchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    organization: {
      type: String,
      required: [true, "Organization is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
    },
    desk: {
      type: String,
      required: [true, "Desk is required"],
    },
    chapter: {
      type: String,
      required: [true, "Chapter is required"],
      index: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
    },
    status: {
      type: String,
      enum: ["Open", "Replied", "Closed"],
      default: "Open",
      index: true,
    },
    replyMessage: {
      type: String,
      default: null,
    },
    repliedAt: {
      type: Date,
      default: null,
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const Query = mongoose.model("Query", querySchema);
export default Query;

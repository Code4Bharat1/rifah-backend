import mongoose from "mongoose";
import { STATUSES } from "../../shared/constants/statuses.js";

const timelineEventSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
  },
  at: {
    type: String,
    default: "Just now",
  },
  done: {
    type: Boolean,
    default: true,
  },
});

const enquirySchema = new mongoose.Schema(
  {
    referenceId: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. ENQ-2041
    },
    title: {
      type: String,
      required: [true, "Requirement title is required"],
      trim: true,
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      required: true,
    },
    requesterRole: {
      type: String,
      default: "Buyer",
    },
    targetBusiness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      index: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    quantity: {
      type: String,
      required: [true, "Quantity is required"],
    },
    budget: {
      type: String,
      default: "Competitive / Market standard",
    },
    location: {
      type: String,
      required: [true, "Delivery location is required"],
    },
    requiredBy: {
      type: String,
      required: [true, "Required-by timeline is required"],
    },
    description: {
      type: String,
      required: [true, "Requirement description is required"],
    },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.ENQUIRY),
      default: STATUSES.ENQUIRY.NEW,
      index: true,
    },
    responsesCount: {
      type: Number,
      default: 0,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolutionNote: {
      type: String,
    },
    timeline: [timelineEventSchema],
  },
  {
    timestamps: true,
  }
);

export const Enquiry = mongoose.model("Enquiry", enquirySchema);
export default Enquiry;

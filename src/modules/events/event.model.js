import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";
import { STATUSES } from "../../shared/constants/statuses.js";

const agendaItemSchema = new mongoose.Schema({
  time: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  speaker: {
    type: String,
    default: "",
  },
});

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Event title is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    summary: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    targetAudience: {
      type: [String],
      enum: ["Consumers", "Businesses", "Chapter Admins"],
      default: [],
    },
    date: {
      type: String,
      required: [true, "Event date is required"],
    },
    time: {
      type: String,
      required: [true, "Event time is required"],
    },
    venue: {
      type: String,
      required: [true, "Venue details are required"],
    },
    city: {
      type: String,
      default: "All Cities",
      trim: true,
      index: true,
    },
    chapter: {
      type: String,
      required: true,
      default: "Mumbai Chapter",
      index: true,
    },
    mode: {
      type: String,
      enum: ENUMS.EVENT_MODES,
      default: "In-person",
    },
    organizer: {
      type: String,
      default: "RIFAH Chamber Secretariat",
    },
    fee: {
      type: String,
      default: "Complimentary for Members",
    },
    seats: {
      type: Number,
      default: 100,
    },
    registeredCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.EVENT),
      default: STATUSES.EVENT.DRAFT,
      index: true,
    },
    agenda: [agendaItemSchema],
    registeredUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    coverImage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const Event = mongoose.model("Event", eventSchema);
export default Event;

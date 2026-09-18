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
      enum: ["Consumers", "Businesses", "Chapter Admins", "All"],
      default: ["All"],
    },
    targetStates: {
      type: [String],
      default: ["All"],
    },
    targetChapters: {
      type: [String],
      default: ["All"],
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
      default: "RIFAH Chamber Central Admin",
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    ticketPrice: {
      type: Number,
      default: 0,
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
    scheduledAt: {
      type: Date,
      default: null,
    },
    agenda: [agendaItemSchema],
    registeredUsers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        registeredAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ["Confirmed", "Cancelled", "Attended"],
          default: "Confirmed",
        },
        attendanceStatus: {
          type: String,
          enum: ["Pending", "Present", "Absent"],
          default: "Pending",
        },
        paymentStatus: {
          type: String,
          enum: ["Free", "Pending", "Paid"],
          default: "Free",
        },
        paymentId: {
          type: String,
        },
        transactionId: {
          type: String,
        }
      },
    ],
    coverImage: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // RIFAH Operations Center Fields
    stageStatus: {
      type: String,
      enum: ["LIVE", "PAUSED", "IDLE", "ENDED"],
      default: "IDLE",
    },
    currentSlideIndex: {
      type: Number,
      default: 0,
    },
    speakers: [
      {
        id: { type: String },
        name: { type: String, required: true },
        mobile: { type: String, default: "" },
        email: { type: String, default: "" },
        type: { type: String, default: "Guest Speaker" },
        organization: { type: String, default: "" },
        designation: { type: String, default: "" },
        topic: { type: String, default: "" },
      },
    ],
    finance: {
      moneyIn: [
        {
          id: { type: String },
          desc: { type: String },
          amount: { type: Number, default: 0 },
          from: { type: String },
          method: { type: String, default: "Online" },
          date: { type: String },
        },
      ],
      moneyOut: [
        {
          id: { type: String },
          desc: { type: String },
          amount: { type: Number, default: 0 },
          to: { type: String },
          invoice: { type: String },
          date: { type: String },
        },
      ],
      treasurerNotes: { type: String, default: "" },
    },
    teamAssignments: [
      {
        role: { type: String },
        name: { type: String },
        mobile: { type: String },
        email: { type: String },
        assignedAt: { type: Date, default: Date.now },
      },
    ],
    signatories: {
      signatory1: { type: String, default: "Chapter President" },
      signatory2: { type: String, default: "Chapter Secretary" },
    },
    slogan: { type: String, default: "" },
    theme: { type: String, default: "" },
    scriptLanguage: { type: String, default: "English" },
    certificateSettings: {
      theme: { type: String, default: "classic-gold" },
      language: { type: String, default: "English" },
      enabled: { type: Boolean, default: true },
      signatory1: { type: String, default: "Chapter President" },
      signatory2: { type: String, default: "Chapter Secretary" },
    },
    membershipRules: { type: String, default: "Members enter free with valid Chamber ID." },
    visitorSignIn: { type: Boolean, default: true },
    memberFee: { type: Number, default: 0 },
    nonMemberFee: { type: Number, default: 500 },
    paymentCodes: [{ type: String }],
    staffCodes: [{ type: String }],
    sponsors: [
      {
        id: { type: String },
        name: { type: String, required: true },
        category: { type: String, default: "Main Sponsor" },
        logo: { type: String, default: "" },
        contact: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        notes: { type: String, default: "" },
      },
    ],
    upcomingEvents: [
      {
        id: { type: String },
        title: { type: String, required: true },
        date: { type: String, default: "" },
        venue: { type: String, default: "" },
        city: { type: String, default: "" },
      },
    ],
    appearance: {
      primaryColor: { type: String, default: "#06b6d4" },
      darkBg: { type: Boolean, default: true },
    },
    projectorUrl: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

eventSchema.pre("save", function (next) {
  if (this.isPaid) {
    this.ticketPrice = Number(this.ticketPrice) || 0;
    this.fee = this.ticketPrice > 0 ? `₹${this.ticketPrice}` : (this.fee || "Free");
  } else {
    this.ticketPrice = 0;
    if (!this.fee || this.fee.startsWith("₹")) {
      this.fee = "Free";
    }
  }
  next();
});

export const Event = mongoose.model("Event", eventSchema);
export default Event;

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
      trim: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ENUMS.EVENT_MODES,
      default: "In-person",
    },
    totalSeats: {
      type: Number,
      default: 0, // 0 means unlimited
    },
    registeredCount: {
      type: Number,
      default: 0,
    },
    meetingLink: {
      type: String,
      trim: true,
    },
    eventCategory: {
      type: String,
      enum: [
        "Meet",
        "Workshop",
        "Seminar",
        "Delegation Tour",
        "Sports",
        "Other Activity",
      ],
      default: "Meet",
      index: true,
    },
    industrySector: {
      type: String,
      enum: [
        "Networking",
        "Business Growth",
        "IT & Digital Services",
        "Finance & Taxation",
        "Import & Export",
        "Women Empowerment",
        "Entrepreneurship Development Program",
        "Start-Up",
        "Skill Development",
        "Delegation Tour/Visit",
        "Government Scheme & Supports",
        "Other",
      ],
      default: "Networking",
      index: true,
    },
    isRegistrationClosed: {
      type: Boolean,
      default: false,
      index: true,
    },
    seatsFull: {
      type: Boolean,
      default: false,
    },
    registrationClosingDate: {
      type: Date,
      default: null,
    },
    sportDetails: {
      sportName: { type: String, default: "" },
      venue: { type: String, default: "" },
      teamsAllowed: { type: Number, default: 0 },
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
    memberPrice: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
    },

    fee: {
      type: String,
      default: "Complimentary for Members",
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
        role: {
          type: String,
          enum: ["guest", "non_member", "member", "customer"],
          default: "guest",
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
        amountPaid: {
          type: Number,
          default: 0,
        },
        baseAmount: {
          type: Number,
          default: 0,
        },
        gstAmount: {
          type: Number,
          default: 0,
        },

        paymentId: {
          type: String,
        },
        transactionId: {
          type: String,
        },
        // Ask & Give networking fields
        asks: [{ type: String }],
        gives: [{ type: String }],
        // Entrance Desk gate management
        gateStatus: {
          type: String,
          enum: ["waiting", "approved", "rejected"],
          default: "waiting",
        },
        gateApprovedAt: { type: Date },

        // Secure Event Entry Ticket & QR Verification fields
        ticketId: {
          type: String,
          index: true,
          default: null,
        },
        ticketType: {
          type: String,
          default: "Member Pass",
        },
        ticketStatus: {
          type: String,
          enum: ["Confirmed", "Cancelled", "Refunded", "Expired"],
          default: "Confirmed",
        },
        verificationToken: {
          type: String,
          default: null,
        },
        checkedIn: {
          type: Boolean,
          default: false,
        },
        checkedInAt: {
          type: Date,
          default: null,
        },
        checkedInBy: {
          type: String,
          default: "",
        },
        checkedInById: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],
    coverImage: {
      type: String,
      default: "",
    },
    posterImage: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // ─── Creator-Scope RBAC Fields ────────────────────────────────────────
    // These are stamped at creation time so access checks are instant.
    creatorRole: {
      type: String,
      default: "central_admin", // central_admin | state_admin | chapter_admin
    },
    creatorChapter: {
      type: String,
      default: "",
      index: true,
    },
    creatorState: {
      type: String,
      default: "",
      index: true,
    },
    // visibilityScope drives the access check in listEvents / getEventBySlugOrId
    //   'global'  → created by central_admin  → everyone can see
    //   'state'   → created by state_admin  → that state's members can see
    //   'chapter' → created by chapter_admin → that chapter's members can see
    visibilityScope: {
      type: String,
      enum: ["global", "state", "chapter"],
      default: "global",
      index: true,
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
    projectorMode: {
      type: String,
      enum: ["slides", "qr", "sponsors", "break"],
      default: "slides",
    },
    activeAnnouncement: {
      type: String,
      default: "",
    },
    stageTimer: {
      duration: { type: Number, default: 600 },
      remaining: { type: Number, default: 600 },
      isRunning: { type: Boolean, default: false },
    },
    agenda: [
      {
        id: { type: Number },
        title: { type: String },
        duration: { type: String },
        speaker: { type: String },
        notes: { type: String, default: "" },
      },
    ],
    moderatorNotes: {
      type: String,
      default: "",
    },
    speakers: [
      {
        id: { type: String },
        name: { type: String, required: true },
        category: { type: String, default: "" },
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
      notes: { type: String, default: "" },
      isClosed: { type: Boolean, default: false },
      treasurerNotes: { type: String, default: "" },
    },
    teamAssignments: {
      chapterAdmin: { type: String, default: "" },
      entranceIncharge: { type: String, default: "" },
      followupCoordinator: { type: String, default: "" },
      treasurer: { type: String, default: "" },
      guestManager: { type: String, default: "" },
      // New Stage Roles & Operations
      photosVideo: { type: String, default: "" },
      tilawatEquran: { type: String, default: "" },
      presidentWelcome: { type: String, default: "" },
      secretaryIntro: { type: String, default: "" },
      eventCoordinator: { type: String, default: "" },
      keynote1: { type: String, default: "" },
      keynote1Topic: { type: String, default: "" },
      keynote1Poster: { type: String, default: "" },
      keynote2: { type: String, default: "" },
      keynote2Topic: { type: String, default: "" },
      keynote2Poster: { type: String, default: "" },
      heroOfEvent: { type: String, default: "" },
      best60SecPitch: { type: String, default: "" },
      closingRemarks: { type: String, default: "" },
      voteOfThanks: { type: String, default: "" },
      eventEnd: { type: String, default: "" },
    },
    // Structured, permission-relevant mirror of the 5 "functional" teamAssignments roles
    // (entranceIncharge, followupCoordinator, treasurer, guestManager, eventCoordinator).
    // teamAssignments above stays the display-name source of truth for scripts/agenda;
    // this carries the actual user link so backend routes can check "is this user assigned".
    roleAssignments: [
      {
        role: { type: String, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
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
    membershipJoiningLink: { type: String, default: "" },
    membershipQrImage: { type: String, default: "" },
    eventPoster: { type: String, default: "" },
    repeatGuestThreshold: { type: Number, default: 3 },
    remindRepeatGuests: { type: Boolean, default: true },
    downloadListPermission: { type: String, default: "Everyone (members and guests)" },
    certificateStyle: { type: String, default: "rifah-signature" }, // legacy fallback
    certificateAccentColor: { type: String, default: "#059669" }, // legacy fallback
    signatory1Role: { type: String, default: "Chapter President" },
    signatory1Name: { type: String, default: "" },
    signatory1Image: { type: String, default: "" },
    signatory2Role: { type: String, default: "Chapter Secretary" },
    signatory2Name: { type: String, default: "" },
    signatory2Image: { type: String, default: "" },
    logoImage: { type: String, default: "" },
    certificateDesign: {
      preset: { type: String, default: "rifah-signature" },
      logo: {
        enabled: { type: Boolean, default: true },
        x: { type: Number, default: 50 },
        y: { type: Number, default: 30 },
        width: { type: Number, default: 120 }
      },
      title: {
        text: { type: String, default: "CERTIFICATE OF PARTICIPATION" },
        fontFamily: { type: String, default: "Helvetica-Bold" },
        fontSize: { type: Number, default: 42 },
        color: { type: String, default: "#0f172a" },
        y: { type: Number, default: 130 }
      },
      participantName: {
        fontFamily: { type: String, default: "Helvetica-Bold" },
        fontSize: { type: Number, default: 38 },
        color: { type: String, default: "#0f172a" },
        y: { type: Number, default: 240 }
      },
      body: {
        text: { type: String, default: "This is proudly presented to\n{{participantName}}\nfor participating in\n{{eventName}}\nheld on {{eventDate}} by RIFAH {{chapterName}}" },
        fontFamily: { type: String, default: "Helvetica" },
        fontSize: { type: Number, default: 16 },
        color: { type: String, default: "#444444" },
        y: { type: Number, default: 200 }
      },
      border: {
        enabled: { type: Boolean, default: true },
        width: { type: Number, default: 4 },
        color: { type: String, default: "#0ea5e9" }
      },
      background: {
        type: { type: String, default: "solid" }, // solid, image
        color: { type: String, default: "#ffffff" }
      }
    },
    // V2 Studio: stores full element array from the canvas-based editor
    certificateDesignV2: {
      type: Object,
      default: null,
    },
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
    // Event Scripts (Stage Prompter)
    scripts: [
      {
        segmentId: { type: String, required: true },
        customText: { type: String, default: "" },
        language: { type: String, default: "English" },
      },
    ],
    // AI usage tracking
    aiUsageToday: { type: Number, default: 0 },
    aiUsageDate: { type: String, default: "" },
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

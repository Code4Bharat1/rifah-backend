import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    membershipTier: {
      type: String,
      default: "Free",
      trim: true,
    },
    chapter: {
      type: String,
      required: [true, "Chapter is required"],
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Hybrid Category (User can select from preset or type custom issue string)
    category: {
      type: String,
      required: [true, "Category or issue type is required"],
      trim: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium",
      index: true,
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    referenceId: {
      type: String,
      trim: true,
      default: "",
    },
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],

    // Multi-tier Status & Hierarchy
    status: {
      type: String,
      enum: ["Open", "In_Progress", "Escalated_To_State", "Escalated_To_Central", "Resolved", "Closed"],
      default: "Open",
      index: true,
    },
    currentLevel: {
      type: String,
      enum: ["CHAPTER", "STATE", "CENTRAL"],
      default: "CHAPTER",
      index: true,
    },

    assignedChapterAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedStateAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedCentralAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Escalation History Trail
    escalations: [
      {
        fromLevel: {
          type: String,
          enum: ["CHAPTER", "STATE"],
          required: true,
        },
        toLevel: {
          type: String,
          enum: ["STATE", "CENTRAL"],
          required: true,
        },
        escalatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        escalatedByName: {
          type: String,
          default: "",
        },
        reason: {
          type: String,
          required: true,
          trim: true,
        },
        handoverNote: {
          type: String,
          required: true,
          trim: true,
        },
        escalatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Conversation & Message Stream
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        senderName: {
          type: String,
          required: true,
        },
        senderRole: {
          type: String,
          required: true,
        },
        message: {
          type: String,
          required: true,
          trim: true,
        },
        attachments: [
          {
            type: String,
            trim: true,
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Final Resolution Details
    resolution: {
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      resolvedByName: {
        type: String,
        default: null,
      },
      resolvedAt: {
        type: Date,
        default: null,
      },
      resolutionNote: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ chapter: 1, status: 1 });
ticketSchema.index({ state: 1, currentLevel: 1 });
ticketSchema.index({ business: 1, status: 1 });
ticketSchema.index({ createdAt: -1 });

export const Ticket = mongoose.model("Ticket", ticketSchema);
export default Ticket;

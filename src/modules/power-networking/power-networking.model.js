import mongoose from "mongoose";

const powerRequirementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Requirement title is required"],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    productService: {
      type: String,
      required: [true, "Product or service name is required"],
      trim: true,
      index: true,
    },
    quantity: {
      type: String,
      required: [true, "Quantity is required"],
      trim: true,
    },
    requiredBy: {
      type: Date,
      required: [true, "Required by date is required"],
      index: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    preferredLocation: {
      type: String,
      trim: true,
      default: "",
    },
    budget: {
      type: String,
      trim: true,
      default: "",
    },
    urgency: {
      type: String,
      enum: ["Low", "Medium", "High", "Immediate"],
      default: "Medium",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["Active", "Fulfilled", "Closed"],
      default: "Active",
      index: true,
    },
    sourceType: {
      type: String,
      default: "POWER_NETWORKING",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

powerRequirementSchema.index({
  title: "text",
  productService: "text",
  category: "text",
  description: "text",
});

const powerConnectionSchema = new mongoose.Schema(
  {
    requesterBusiness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    requesterUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverBusiness: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    receiverUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requirement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PowerRequirement",
      default: null,
      index: true,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Declined", "Cancelled", "Removed"],
      default: "Pending",
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    removedAt: {
      type: Date,
      default: null,
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate connections between same pair of businesses
powerConnectionSchema.index(
  { requesterBusiness: 1, receiverBusiness: 1 },
  { background: true }
);

powerConnectionSchema.index(
  { requesterBusiness: 1, receiverBusiness: 1, requirement: 1 },
  { background: true }
);

export const PowerRequirement = mongoose.model("PowerRequirement", powerRequirementSchema);
export const PowerConnection = mongoose.model("PowerConnection", powerConnectionSchema);


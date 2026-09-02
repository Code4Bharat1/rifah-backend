import mongoose from "mongoose";
import { ROLES } from "../../shared/constants/roles.js";
import { STATUSES } from "../../shared/constants/statuses.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: false,
      default: "",
      select: false,
    },
    googleId: {
      type: String,
      default: "",
      index: true,
      sparse: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CUSTOMER,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(STATUSES.USER),
      default: STATUSES.USER.ACTIVE,
      index: true,
    },
    chapter: {
      type: String,
      trim: true,
      default: "Mumbai Chapter",
    },
    organization: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "Mumbai",
    },
    sourcingInterest: {
      type: String,
      trim: true,
      default: "",
    },
    sourcingInterests: [
      {
        type: String,
        trim: true,
      },
    ],
    taxId: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    // Customer/Buyer saved suppliers/businesses bookmarks
    savedBusinesses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
      },
    ],
    // Permissions override (for granular RBAC)
    permissions: [
      {
        type: String,
      },
    ],
    lastLoginAt: {
      type: Date,
    },
    forcePasswordChange: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const User = mongoose.model("User", userSchema);
export default User;

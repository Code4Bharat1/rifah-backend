import mongoose from "mongoose";

const stateProfileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "State name is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    image: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for formatted name
stateProfileSchema.virtual("formattedName").get(function () {
  if (!this.name) return "";
  return this.name
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
});

// Ensure virtuals are included in JSON output
stateProfileSchema.set("toJSON", { virtuals: true });
stateProfileSchema.set("toObject", { virtuals: true });

export const StateProfile = mongoose.model("StateProfile", stateProfileSchema);

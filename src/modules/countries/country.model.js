import mongoose from "mongoose";

const countrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Country name is required"],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: [true, "Country code is required"],
      trim: true,
      uppercase: true,
      unique: true,
      minlength: 2,
      maxlength: 3,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Country = mongoose.model("Country", countrySchema);
export default Country;

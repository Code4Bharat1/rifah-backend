import mongoose from "mongoose";
import { ENUMS } from "../../shared/constants/enums.js";

const catalogueSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ENUMS.CATALOGUE_TYPES,
      default: "Product",
      index: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    moq: {
      type: String,
      default: "", // Minimum Order Quantity e.g. "500 units"
    },
    price: {
      type: String,
      default: "On Request",
    },
    images: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["Active", "Draft", "Archived"],
      default: "Active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

catalogueSchema.index({ name: "text", description: "text", category: "text" });

export const Catalogue = mongoose.model("Catalogue", catalogueSchema);
export default Catalogue;

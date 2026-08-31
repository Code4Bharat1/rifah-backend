import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    parent: {
      type: String,
      trim: true,
      default: "", // Parent sector e.g. "Manufacturing", "Trading & Export"
    },
    icon: {
      type: String,
      default: "",
    },
    businessCount: {
      type: Number,
      default: 0,
    },
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

export const Category = mongoose.model("Category", categorySchema);
export default Category;

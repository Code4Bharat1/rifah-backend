import mongoose from "mongoose";

const unitSubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  focus: {
    type: String,
    default: "",
  },
  membersCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["Active", "Planned", "Inactive"],
    default: "Active",
  },
});

const chapterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Chapter name is required"],
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Country",
      default: null,
      index: true,
    },
    country: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    stateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StateProfile",
      default: null,
      index: true,
    },
    state: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    lead: {
      type: String,
      default: "Chapter Secretary",
    },
    businessesCount: {
      type: Number,
      default: 0,
    },
    membersCount: {
      type: Number,
      default: 0,
    },
    eventsCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Forming", "Inactive"],
      default: "Active",
      index: true,
    },
    units: [unitSubSchema],
  },
  {
    timestamps: true,
  },
);

export const Chapter = mongoose.model("Chapter", chapterSchema);
export default Chapter;

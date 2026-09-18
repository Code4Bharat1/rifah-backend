import mongoose from "mongoose";

const courseContentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["video", "pdf"],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    required: true,
  }
});

const courseChapterSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  order: {
    type: Number,
    default: 1,
  },
  contents: [courseContentSchema],
});

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    scope: {
      type: String,
      enum: ["centre", "state", "chapter"],
      required: true,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
    },
    chapters: [courseChapterSchema],
    contents: [courseContentSchema],
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  {
    timestamps: true,
  }
);

export const Course = mongoose.model("Course", courseSchema);
export default Course;

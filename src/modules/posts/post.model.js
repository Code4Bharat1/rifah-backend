import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    // The user who created this post
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Author's display name at time of posting (denormalized for performance)
    authorName: { type: String, default: "" },
    authorRole: {
      type: String,
      enum: ["central_admin", "state_admin", "chapter_admin", "business_owner", "customer", "public"],
      default: "business_owner",
    },
    authorAvatar: { type: String, default: "" },
    // Chapter/State scoping
    chapter: { type: String, trim: true, default: "", index: true },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
    },
    state: { type: String, trim: true, default: "", index: true },
    // Post content
    caption: {
      type: String,
      required: [true, "Caption is required"],
      trim: true,
      maxlength: [2000, "Caption cannot exceed 2000 characters"],
    },
    // Images (URLs — stored after upload)
    images: [{ type: String }],
    // Engagement
    likesCount: { type: Number, default: 0, min: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        authorName: { type: String },
        authorAvatar: { type: String, default: "" },
        text: { type: String, required: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Soft delete
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

postSchema.index({ chapter: 1, createdAt: -1 });
postSchema.index({ state: 1, createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

export const Post = mongoose.model("Post", postSchema);
export default Post;

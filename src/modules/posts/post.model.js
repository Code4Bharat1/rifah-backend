import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    // User who created the post
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Author information at the time of posting
    authorName: {
      type: String,
      default: "",
      trim: true,
    },

    authorRole: {
      type: String,
      enum: [
        "central_admin",
        "state_admin",
        "chapter_admin",
        "business_owner",
        "customer",
        "public",
      ],
      default: "business_owner",
    },

    authorAvatar: {
      type: String,
      default: "",
      trim: true,
    },

    // Chapter / State scoping
    chapter: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
    },

    state: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    // Optional Post Title (e.g. for events, announcements)
    title: {
      type: String,
      default: "",
      trim: true,
    },

    // Link to an event if auto-generated or related
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },

    // Post content
    caption: {
      type: String,
      required: [true, "Caption is required"],
      trim: true,
      maxlength: [2000, "Caption cannot exceed 2000 characters"],
    },

    // Post images (URLs, static paths, or binary media objects)
    images: [{ type: mongoose.Schema.Types.Mixed }],

    // Engagement
    likesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Comments
    comments: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          auto: true,
        },

        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },

        authorName: {
          type: String,
          default: "",
          trim: true,
        },

        authorAvatar: {
          type: String,
          default: "",
        },

        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 500,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },

  {
    timestamps: true,
  }
);

// Indexes
postSchema.index({
  chapter: 1,
  createdAt: -1,
});

postSchema.index({
  state: 1,
  createdAt: -1,
});

postSchema.index({
  author: 1,
  createdAt: -1,
});

// Model
export const Post = mongoose.model("Post", postSchema);

export default Post;
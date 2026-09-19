import { Post } from "./post.model.js";
import { User } from "../users/user.model.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";

const ADMIN_ROLES = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];

/**
 * Format a post document for consistent API responses across client devices
 */
function formatPost(post, currentUserId) {
  const currentUidStr = currentUserId ? String(currentUserId) : null;
  const likedByArr = Array.isArray(post.likedBy) ? post.likedBy : [];
  const isLiked = Boolean(
    currentUidStr && likedByArr.some((id) => String(id?._id || id) === currentUidStr)
  );

  const authorObj = post.author && typeof post.author === "object" ? post.author : {};
  const authorName = post.authorName || authorObj.name || "Member";
  const authorRole = post.authorRole || authorObj.role || "business_owner";
  const authorAvatar = post.authorAvatar || authorObj.avatar || "";
  const authorId = String(authorObj._id || post.author || "");
  const formattedUsername = authorName.toLowerCase().replace(/\s+/g, "_");

  const chapter = post.chapter || "";
  const state = post.state || "";
  let subtitle = "";
  if (chapter && state) subtitle = `${chapter} • ${state}`;
  else if (chapter) subtitle = chapter;
  else if (state) subtitle = state;

  return {
    id: String(post._id),
    _id: String(post._id),
    createdById: authorId,
    createdByRole: authorRole,
    createdByUsername: formattedUsername,
    chapter,
    chapterId: post.chapterId ? String(post.chapterId) : null,
    state,
    author: {
      id: authorId,
      username: formattedUsername,
      name: authorName,
      avatar: authorAvatar,
      role: authorRole,
      verified: ADMIN_ROLES.includes(authorRole) || authorRole === ROLES.CENTRAL_ADMIN,
      subtitle,
      timeAgo: "Just now",
    },
    images: Array.isArray(post.images) && post.images.length > 0 ? post.images : (post.image ? [post.image] : []),
    caption: post.caption || "",
    likesCount: typeof post.likesCount === "number" ? post.likesCount : likedByArr.length,
    likedBy: likedByArr.map((id) => String(id?._id || id)),
    isLiked,
    comments: (post.comments || []).map((c) => ({
      id: String(c._id || c.id),
      _id: String(c._id || c.id),
      authorId: String(c.author || ""),
      username: (c.authorName || "member").toLowerCase().replace(/\s+/g, "_"),
      name: c.authorName || "Member",
      avatar: c.authorAvatar || "",
      text: c.text,
      createdAt: c.createdAt,
    })),
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export const postService = {
  /**
   * Seed default welcome posts if collection is empty
   */
  ensureDefaultPosts: async () => {
    try {
      const count = await Post.countDocuments({ isDeleted: false });
      if (count > 0) return;

      // Find an admin user to attribute posts to
      const adminUser = await User.findOne({
        role: { $in: [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN] },
      }).select("_id name avatar role chapter state").lean();

      if (!adminUser) return;

      const seedPosts = [
        {
          author: adminUser._id,
          authorName: adminUser.name || "RIFAH Central Admin",
          authorRole: ROLES.CENTRAL_ADMIN,
          authorAvatar: adminUser.avatar || "",
          chapter: "Mumbai Central",
          state: "Maharashtra",
          caption: "Welcome to RIFAH Connect Live Feeds! 🌟 Share your business milestones, new product launches, partnerships, and announcements with fellow entrepreneurs across all chapters.",
          images: ["https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1080&q=80"],
          likesCount: 12,
          comments: [
            {
              author: adminUser._id,
              authorName: "RIFAH Community",
              text: "Great to have our member business community connected here!",
              createdAt: new Date(Date.now() - 3600000),
            },
          ],
        },
        {
          author: adminUser._id,
          authorName: "RIFAH Chamber",
          authorRole: ROLES.CENTRAL_ADMIN,
          authorAvatar: adminUser.avatar || "",
          chapter: "Bangalore",
          state: "Karnataka",
          caption: "Annual Chamber Business Meetup 2026! Over 500+ MSMEs and enterprises joining together for collaborative business development. #Networking #Growth",
          images: ["https://images.unsplash.com/photo-1511578314322-379afb476865?w=1080&q=80"],
          likesCount: 8,
          comments: [],
        },
      ];

      await Post.insertMany(seedPosts);
    } catch (err) {
      // Non-blocking fallback
    }
  },

  /**
   * List all posts (with optional chapter/state/search filter)
   * BY DEFAULT, ALL POSTS ARE SHOWN TO ALL USERS!
   */
  listPosts: async (queryParams = {}, user) => {
    // Seed initial posts if empty so the feed is never blank
    await postService.ensureDefaultPosts();

    const filter = { isDeleted: false };
    const { chapter, state, filterMode, search } = queryParams;
    const page = Math.max(1, parseInt(queryParams.page) || 1);
    const limit = Math.min(200, parseInt(queryParams.limit) || 100);
    const skip = (page - 1) * limit;

    // Apply explicit chapter filter if selected
    if (filterMode === "chapter" && chapter && chapter !== "ALL_CHAPTERS") {
      const cleanChapter = chapter.replace(/\b(chapter|chamber)\b/gi, "").trim();
      filter.chapter = { $regex: new RegExp(cleanChapter, "i") };
    }

    // Apply explicit state filter if selected
    if (filterMode === "state" && state && state !== "ALL_STATES") {
      filter.state = { $regex: new RegExp(state.trim(), "i") };
    }

    // Text search filter
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { caption: { $regex: new RegExp(q, "i") } },
        { authorName: { $regex: new RegExp(q, "i") } },
        { chapter: { $regex: new RegExp(q, "i") } },
        { state: { $regex: new RegExp(q, "i") } },
      ];
    }

    const currentUserId = user?.id || user?._id || null;

    const [rawPosts, total] = await Promise.all([
      Post.find(filter)
        .populate("author", "name email avatar role chapter state")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter),
    ]);

    const posts = rawPosts.map((p) => formatPost(p, currentUserId));

    return { posts, total, page, limit };
  },

  /**
   * Create a new post
   */
  createPost: async (data, user) => {
    let authorName = data.authorName || user.name || "";
    let authorAvatar = data.authorAvatar || user.avatar || "";
    let authorRole = user.role;

    // Retrieve full profile from DB if name or avatar is missing on token
    if (!authorName || !authorAvatar) {
      try {
        const userDoc = await User.findById(user.id || user._id)
          .select("name avatar role chapter state")
          .lean();
        if (userDoc) {
          if (!authorName) authorName = userDoc.name || "";
          if (!authorAvatar) authorAvatar = userDoc.avatar || "";
          if (!authorRole) authorRole = userDoc.role;
        }
      } catch (err) {
        // ignore
      }
    }

    let images = [];
    if (Array.isArray(data.images)) {
      images = data.images.filter(Boolean);
    } else if (data.image) {
      images = [data.image];
    }

    const post = new Post({
      author: user.id || user._id,
      authorName: authorName || "Member",
      authorRole: authorRole || "business_owner",
      authorAvatar: authorAvatar || "",
      chapter: data.chapter || user.chapter || "",
      chapterId: data.chapterId || user.chapterId || null,
      state: data.state || user.state || "",
      caption: data.caption,
      images,
    });

    await post.save();
    return formatPost(post.toObject(), user.id || user._id);
  },

  /**
   * Upload an image for a post
   */
  uploadImage: async (file) => {
    if (!file) throw new NotFoundError("No file provided");
    const fileUrl = await storageService.uploadFile(file, "posts");
    return { url: fileUrl };
  },

  /**
   * Toggle like on a post
   */
  toggleLike: async (postId, userId) => {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new NotFoundError("Post not found");

    const uidStr = String(userId);
    const idx = post.likedBy.findIndex((id) => String(id) === uidStr);
    let isLiked = false;

    if (idx === -1) {
      post.likedBy.push(userId);
      isLiked = true;
    } else {
      post.likedBy.splice(idx, 1);
      isLiked = false;
    }

    post.likesCount = post.likedBy.length;
    await post.save();

    return { likesCount: post.likesCount, isLiked };
  },

  /**
   * Add a comment to a post
   */
  addComment: async (postId, { text, authorName, authorAvatar }, user) => {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new NotFoundError("Post not found");

    let name = authorName || user.name || "";
    let avatar = authorAvatar || user.avatar || "";

    if (!name) {
      try {
        const userDoc = await User.findById(user.id || user._id).select("name avatar").lean();
        if (userDoc) {
          name = userDoc.name || "Member";
          avatar = avatar || userDoc.avatar || "";
        }
      } catch (e) {}
    }

    const comment = {
      author: user.id || user._id,
      authorName: name || "Member",
      authorAvatar: avatar || "",
      text,
      createdAt: new Date(),
    };

    post.comments.push(comment);
    await post.save();

    const savedComment = post.comments[post.comments.length - 1];
    return {
      id: String(savedComment._id),
      _id: String(savedComment._id),
      authorId: String(savedComment.author),
      username: (savedComment.authorName || "member").toLowerCase().replace(/\s+/g, "_"),
      name: savedComment.authorName || "Member",
      avatar: savedComment.authorAvatar || "",
      text: savedComment.text,
      createdAt: savedComment.createdAt,
    };
  },

  /**
   * Delete a post — only author or admin can delete
   */
  deletePost: async (postId, user) => {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new NotFoundError("Post not found");

    const isAuthor = String(post.author) === String(user.id || user._id);
    const isAdmin = ADMIN_ROLES.includes(user.role);

    if (!isAuthor && !isAdmin) {
      throw new ForbiddenError("You do not have permission to delete this post");
    }

    post.isDeleted = true;
    await post.save();
    return true;
  },

  /**
   * Delete comment
   */
  deleteComment: async (postId, commentId, user) => {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new NotFoundError("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) throw new NotFoundError("Comment not found");

    const isCommentAuthor = comment.author && String(comment.author) === String(user.id || user._id);
    const isPostAuthor = String(post.author) === String(user.id || user._id);
    const isAdmin = ADMIN_ROLES.includes(user.role);

    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      throw new ForbiddenError("You cannot delete this comment");
    }

    post.comments.pull(commentId);
    await post.save();
    return true;
  },
};

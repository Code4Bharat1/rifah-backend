import { postService } from "./post.service.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";

export const postController = {
  list: asyncHandler(async (req, res) => {
    const result = await postService.listPosts(req.query, req.user);
    return ApiResponse.success(res, result.posts, "Posts retrieved", 200, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  }),

  create: asyncHandler(async (req, res) => {
    const post = await postService.createPost(req.body, req.user);
    return ApiResponse.created(res, post, "Post published successfully");
  }),

  upload: asyncHandler(async (req, res) => {
    if (!req.file) {
      return ApiResponse.error(res, "No image file provided", 400);
    }
    const result = await postService.uploadImage(req.file);
    return ApiResponse.success(res, result, "Image uploaded successfully");
  }),

  toggleLike: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await postService.toggleLike(id, req.user.id);
    return ApiResponse.success(res, result, "Like toggled");
  }),

  addComment: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const comment = await postService.addComment(id, req.body, req.user);
    return ApiResponse.created(res, comment, "Comment added");
  }),

  deletePost: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await postService.deletePost(id, req.user);
    return ApiResponse.success(res, null, "Post deleted successfully");
  }),

  deleteComment: asyncHandler(async (req, res) => {
    const { id, commentId } = req.params;
    await postService.deleteComment(id, commentId, req.user);
    return ApiResponse.success(res, null, "Comment deleted");
  }),
};

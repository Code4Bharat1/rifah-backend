import { Router } from "express";
import { postController } from "./post.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";

const router = Router();

// GET /posts — optional auth so all users/guests can see feed posts by default,
// but authenticated users have their personalized isLiked status populated
router.get("/", optionalAuthMiddleware, postController.list);

// POST /posts/upload — upload an image file
router.post("/upload", authMiddleware, upload.single("image"), postController.upload);

// POST /posts — create a new post
router.post("/", authMiddleware, postController.create);

// DELETE /posts/:id — delete a post (author or admin)
router.delete("/:id", authMiddleware, postController.deletePost);

// POST /posts/:id/like — toggle like
router.post("/:id/like", authMiddleware, postController.toggleLike);

// POST /posts/:id/comments — add a comment
router.post("/:id/comments", authMiddleware, postController.addComment);

// DELETE /posts/:id/comments/:commentId — delete a comment
router.delete("/:id/comments/:commentId", authMiddleware, postController.deleteComment);

export { router as postRoutes };
export default router;

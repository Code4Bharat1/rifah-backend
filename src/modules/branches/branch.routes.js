import { Router } from "express";
import { branchController } from "./branch.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";

const router = Router();

// Public route: get all visible branches of a business
router.get("/business/:businessId", branchController.getPublicBranches);

// Protected routes (business owner)
router.get("/my", authMiddleware, branchController.getMyBranches);
router.post("/upload", authMiddleware, upload.single("image"), branchController.uploadImage);
router.post("/", authMiddleware, branchController.createBranch);
router.put("/:id", authMiddleware, branchController.updateBranch);
router.patch("/:id/visibility", authMiddleware, branchController.toggleVisibility);
router.delete("/:id", authMiddleware, branchController.deleteBranch);

export { router as branchRoutes };
export default router;

import express from "express";
import { fileController } from "./file.controller.js";

const router = express.Router();

// Public route to fetch files by ID
router.get("/:id", fileController.getFile);

export { router as fileRoutes };
export default router;

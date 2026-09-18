import { Router } from "express";
import { followupController } from "./followup.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", followupController.getFollowups);
router.get("/stats", followupController.getStats);
router.post("/", followupController.create);
router.post("/sync-event/:eventId", followupController.syncEvent);
router.patch("/:id/status", followupController.updateStatus);
router.post("/:id/note", followupController.addNote);
router.post("/:id/message", followupController.logMessage);

export { router as followupRoutes };

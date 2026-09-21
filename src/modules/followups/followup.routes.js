import { Router } from "express";
import { followupController } from "./followup.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireEventRoleOrAdminByBodyEvent, requireEventRoleOrAdminByFollowupId } from "../../middleware/event-role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", requireEventRoleOrAdminByBodyEvent("followupCoordinator"), followupController.getFollowups);
router.get("/stats", followupController.getStats);
router.post("/", followupController.create);
router.post("/sync-event/:eventId", followupController.syncEvent);
router.post("/sync/members", followupController.syncMembers);
router.patch("/:id/status", requireEventRoleOrAdminByFollowupId("followupCoordinator"), followupController.updateStatus);
router.post("/:id/note", requireEventRoleOrAdminByFollowupId("followupCoordinator"), followupController.addNote);
router.post("/:id/message", requireEventRoleOrAdminByFollowupId("followupCoordinator"), followupController.logMessage);
router.post("/:id/history", requireEventRoleOrAdminByFollowupId("followupCoordinator"), followupController.addHistory);
router.delete("/:id", followupController.deleteFollowup);

export { router as followupRoutes };

import { Router } from "express";
import { followupController } from "./followup.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";
import { requireFollowupInScope, requireEventInScope, requireChapterInScope } from "../../middleware/followup-scope.middleware.js";
import { requireEventRoleOrAdminByBodyEvent, requireEventRoleOrAdminByFollowupId } from "../../middleware/event-role.middleware.js";

const router = Router();

router.use(authMiddleware);

const adminOnly = requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN);

router.get("/", requireEventRoleOrAdminByBodyEvent("followupCoordinator"), followupController.getFollowups);
router.get("/stats", adminOnly, followupController.getStats);
router.post("/", adminOnly, followupController.create);
router.post("/sync-event/:eventId", adminOnly, requireEventInScope, followupController.syncEvent);
router.post("/sync/members", adminOnly, requireChapterInScope, followupController.syncMembers);
router.patch("/:id/status", requireEventRoleOrAdminByFollowupId("followupCoordinator"), requireFollowupInScope, followupController.updateStatus);
router.post("/:id/note", requireEventRoleOrAdminByFollowupId("followupCoordinator"), requireFollowupInScope, followupController.addNote);
router.post("/:id/message", requireEventRoleOrAdminByFollowupId("followupCoordinator"), requireFollowupInScope, followupController.logMessage);
router.post("/:id/history", requireEventRoleOrAdminByFollowupId("followupCoordinator"), requireFollowupInScope, followupController.addHistory);
router.delete("/:id", adminOnly, requireFollowupInScope, followupController.deleteFollowup);

export { router as followupRoutes };

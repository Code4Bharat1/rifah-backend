import { Router } from "express";
import { announcementController } from "./announcement.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Protect all announcement routes
router.use(authMiddleware);

// Only allow Chapter Admin, Secretariat, and Super Admin to manage announcements
router.use(requireRole(ROLES.CHAPTER_ADMIN, ROLES.SECRETARIAT, ROLES.SUPER_ADMIN));

router.route("/")
  .get(announcementController.list)
  .post(announcementController.create);

router.route("/:id")
  .get(announcementController.getById)
  .patch(announcementController.update)
  .delete(announcementController.delete);

export default router;

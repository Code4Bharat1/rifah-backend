import { Router } from "express";
import { courseController } from "./course.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.use(authMiddleware);

// Admin Routes (Create, Update, Upload)
router.post(
  "/",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  courseController.createCourse
);

router.put(
  "/:id",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  courseController.updateCourse
);

router.delete(
  "/:id",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  courseController.deleteCourse
);

router.post(
  "/upload",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  upload.single("file"),
  courseController.uploadContent
);

// Business Routes (Watch, Certificates)
router.post(
  "/:id/contents/:contentId/watch",
  requireRole(ROLES.BUSINESS_OWNER),
  courseController.markWatched
);

router.get("/certificates", courseController.getCertificates);

// Common Routes (List, View Details)
router.get("/", courseController.getCourses);
router.get("/:id", courseController.getCourseDetails);

export { router as courseRoutes };
export default router;

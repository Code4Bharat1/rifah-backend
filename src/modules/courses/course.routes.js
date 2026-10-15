import { Router } from "express";
import { courseController } from "./course.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.use(authMiddleware);

// Course Management: Central Admin & Country Admin
router.post(
  "/",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.createCourse
);

router.put(
  "/:id",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.updateCourse
);

router.delete(
  "/:id",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.deleteCourse
);

router.post(
  "/upload",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  upload.single("file"),
  courseController.uploadContent
);

// Course Moderation / Approval & Enrollment Routes
router.post(
  "/:id/approve",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.approveCourse
);

router.post(
  "/:id/reject",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.rejectCourse
);

router.get(
  "/:id/enrollments",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.getCourseEnrollments
);

router.post(
  "/:id/manual-enroll",
  requireRole(ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN),
  courseController.manualEnrollUser
);

// Learner Routes (Watch, Certificates)
router.post(
  "/:id/contents/:contentId/watch",
  requireRole(ROLES.BUSINESS_OWNER, ROLES.CUSTOMER, ROLES.BUYER),
  courseController.markWatched
);

router.get("/certificates", courseController.getCertificates);
router.patch("/:id/toggle-star", courseController.toggleStar);

// Common Routes (List, View Details)
router.get("/", courseController.getCourses);
router.get("/:id", courseController.getCourseDetails);

export { router as courseRoutes };
export default router;

import { Router } from "express";
import { anniversaryController } from "./anniversary.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// All anniversary endpoints require authentication
router.use(authMiddleware);

// Get today's anniversaries for current user (Self + Chapter businesses)
router.get("/today", anniversaryController.getTodayAnniversaries);

// Manual trigger for anniversary email dispatch (Admins only)
router.post(
  "/trigger-emails",
  requireRole(ROLES.CENTRAL_ADMIN),
  anniversaryController.triggerAnniversaryEmails
);

// Seed test businesses celebrating anniversary today
router.post("/seed-test", anniversaryController.seedAnniversaryTestData);

// Remove test anniversary businesses and users
router.post("/clean-test", anniversaryController.cleanAnniversaryTestData);

export default router;


import { Router } from "express";
import { anniversaryController } from "./anniversary.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";

const router = Router();

// All anniversary endpoints require authentication
router.use(authMiddleware);

// Get today's anniversaries for current user (Self + Chapter businesses)
router.get("/today", anniversaryController.getTodayAnniversaries);

// Manual trigger for anniversary email dispatch (Admins only)
router.post(
  "/trigger-emails",
  requireRole(["super_admin", "secretariat"]),
  anniversaryController.triggerAnniversaryEmails
);

export default router;

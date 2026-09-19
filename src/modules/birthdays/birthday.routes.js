import { Router } from "express";
import { birthdayController } from "./birthday.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// All birthday endpoints require authentication
router.use(authMiddleware);

// Get today's birthdays for current user (Self + Chapter members)
router.get("/today", birthdayController.getTodayBirthdays);

// Manual trigger for birthday email dispatch (Admins only)
router.post(
  "/trigger-emails",
  requireRole(ROLES.CENTRAL_ADMIN),
  birthdayController.triggerBirthdayEmails
);


export default router;

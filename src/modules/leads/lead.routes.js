import { Router } from "express";
import { leadController } from "./lead.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateRouteLead,
  validateSubmitQuotation,
  validateUpdateLeadStatus,
} from "./lead.validation.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Business Owner workspace leads
router.get("/me", authMiddleware, leadController.getMyLeads);
router.get("/my-leads", authMiddleware, leadController.getMyLeads);
router.get("/:id", authMiddleware, validateObjectIdParam("id"), leadController.getLeadById);

router.post(
  "/:id/quote",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateSubmitQuotation),
  leadController.submitQuotation
);

router.patch(
  "/:id/status",
  authMiddleware,
  validateObjectIdParam("id"),
  validateRequest(validateUpdateLeadStatus),
  leadController.updateLeadStatus
);

// Admin enquiry routing to businesses
router.post(
  "/route",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN),
  validateRequest(validateRouteLead),
  leadController.routeLead
);

export { router as leadRoutes };
export default router;

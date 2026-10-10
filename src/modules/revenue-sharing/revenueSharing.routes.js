import { Router } from "express";
import { revenueSharingController } from "./revenueSharing.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectIdParam } from "../../shared/validators/object-id.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

const ANY_ADMIN = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];

router.use(authMiddleware);

// Ledger — read-only, scoped server-side (see revenueReport.service.js buildLedgerFilter)
router.get("/ledger", requireRole(...ANY_ADMIN), revenueSharingController.listLedger);
router.get("/ledger/:id", requireRole(...ANY_ADMIN), validateObjectIdParam("id"), revenueSharingController.getLedgerEntry);
router.get("/balance", requireRole(...ANY_ADMIN), revenueSharingController.getBalance);
router.get("/dashboard", requireRole(...ANY_ADMIN), revenueSharingController.getDashboard);

// Exports — same ?format=csv|pdf convention as /reports/admin/export/revenue
router.get("/export/ledger", requireRole(...ANY_ADMIN), revenueSharingController.exportLedger);

// Claims — State/Chapter Admin submit for their own org; Central Admin reviews/decides.
router.post("/claims", requireRole(ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN), revenueSharingController.createClaim);
router.get("/claims", requireRole(...ANY_ADMIN), revenueSharingController.listClaims);
router.get("/claims/:id", requireRole(...ANY_ADMIN), validateObjectIdParam("id"), revenueSharingController.getClaim);
router.patch(
  "/claims/:id/submit",
  requireRole(ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN),
  validateObjectIdParam("id"),
  revenueSharingController.submitClaim
);
router.patch("/claims/:id/review", requireRole(ROLES.CENTRAL_ADMIN), validateObjectIdParam("id"), revenueSharingController.reviewClaim);
router.patch("/claims/:id/approve", requireRole(ROLES.CENTRAL_ADMIN), validateObjectIdParam("id"), revenueSharingController.approveClaim);
router.patch("/claims/:id/reject", requireRole(ROLES.CENTRAL_ADMIN), validateObjectIdParam("id"), revenueSharingController.rejectClaim);
router.patch(
  "/claims/:id/cancel",
  requireRole(...ANY_ADMIN),
  validateObjectIdParam("id"),
  revenueSharingController.cancelClaim
);

// Settlements — Central Admin only; the only operation that reduces outstanding balance.
router.post(
  "/claims/:id/settlements",
  requireRole(ROLES.CENTRAL_ADMIN),
  validateObjectIdParam("id"),
  revenueSharingController.recordSettlement
);

// Rule configuration — Central Admin only, versioned/effective-dated.
router.get("/rules", requireRole(...ANY_ADMIN), revenueSharingController.listRules);
router.post("/rules", requireRole(ROLES.CENTRAL_ADMIN), revenueSharingController.createRuleVersion);

export { router as revenueSharingRoutes };
export default router;

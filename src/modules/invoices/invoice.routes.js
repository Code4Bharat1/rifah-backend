import { Router } from "express";
import { invoiceController } from "./invoice.controller.js";
import { verificationRateLimitMiddleware } from "../../middleware/rate-limit.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// Public Verification Endpoint (Rate limited against enumeration)
router.get("/verify/:invoiceNumber", verificationRateLimitMiddleware, invoiceController.verifyInvoice);

// Public / Secure PDF Download Endpoint
router.get("/download/:invoiceNumber", verificationRateLimitMiddleware, invoiceController.downloadPdf);

// Admin Revoke Endpoint
router.patch("/:invoiceNumber/revoke", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN), invoiceController.revokeInvoice);

export { router as invoiceRoutes };
export default router;

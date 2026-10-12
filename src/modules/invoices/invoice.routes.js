import { Router } from "express";
import { invoiceController } from "./invoice.controller.js";
import { verificationRateLimitMiddleware } from "../../middleware/rate-limit.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

const resolveInvoiceParam = (req, res, next) => {
  if (req.params[0]) {
    req.params.invoiceNumber = decodeURIComponent(req.params[0]);
  } else if (req.params.invoiceNumber) {
    req.params.invoiceNumber = decodeURIComponent(req.params.invoiceNumber);
  }
  next();
};

// Public Verification Endpoint (supports /verify/INV-1001 and /verify/RCCI/25-26/0001)
router.get("/verify/*", verificationRateLimitMiddleware, resolveInvoiceParam, invoiceController.verifyInvoice);
router.get("/verify/:invoiceNumber", verificationRateLimitMiddleware, resolveInvoiceParam, invoiceController.verifyInvoice);

// Public / Secure PDF Download Endpoint
router.get("/download/*", verificationRateLimitMiddleware, resolveInvoiceParam, invoiceController.downloadPdf);
router.get("/download/:invoiceNumber", verificationRateLimitMiddleware, resolveInvoiceParam, invoiceController.downloadPdf);

// Admin Revoke Endpoint
router.patch("/*/revoke", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN), resolveInvoiceParam, invoiceController.revokeInvoice);
router.patch("/:invoiceNumber/revoke", authMiddleware, requireRole(ROLES.CENTRAL_ADMIN), resolveInvoiceParam, invoiceController.revokeInvoice);

export { router as invoiceRoutes };
export default router;

import { Router } from "express";
import { paymentController } from "./payment.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import { validateCreatePayment } from "./payment.validation.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validateRequest(validateCreatePayment),
  paymentController.createPayment
);

router.get("/me", authMiddleware, paymentController.getMyPayments);
router.get("/my", authMiddleware, paymentController.getMyPayments);
router.get("/invoice/:identifier", authMiddleware, paymentController.getInvoice);

// Admin all transactions ledger
router.get(
  "/",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  paymentController.listAllPayments
);
router.get(
  "/admin/all",
  authMiddleware,
  requireRole(ROLES.SUPER_ADMIN, ROLES.SECRETARIAT),
  paymentController.listAllPayments
);

export { router as paymentRoutes };
export default router;

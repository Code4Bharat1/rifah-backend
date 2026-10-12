import { Router } from "express";
import { visaReferralController } from "./visa-referral.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { ROLES } from "../../shared/constants/roles.js";

const router = Router();

// 1. Upload Supporting Documents (Images / PDFs / Documents)
router.post(
  "/upload",
  optionalAuthMiddleware,
  upload.single("file"),
  visaReferralController.uploadDocument
);

// 2. Submit Visa Referral Application (Open to Everyone: Public, Users, Members)
router.post("/", optionalAuthMiddleware, visaReferralController.create);

// 3. Authenticated User / Member: View My Applications
router.get("/my", authMiddleware, visaReferralController.listUser);

// --------------------------------------------------------------------------
// 5. CENTRAL ADMIN ONLY ROUTES - STRICTLY NO STATE OR CHAPTER ADMIN ACCESS
// --------------------------------------------------------------------------
router.use(authMiddleware);
router.use(requireRole(ROLES.CENTRAL_ADMIN));

router.get("/stats", visaReferralController.getStats);
router.get("/", visaReferralController.listAdmin);
router.get("/:id", visaReferralController.getById);
router.patch("/:id/status", visaReferralController.updateStatus);
router.post("/:id/deliver", visaReferralController.deliverLetter);

export { router as visaReferralRoutes };
export default router;

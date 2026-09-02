import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { authRateLimitMiddleware } from "../../middleware/rate-limit.middleware.js";
import { validateRequest } from "../../middleware/validation.middleware.js";
import {
  validateRegister,
  validateRegisterBusiness,
  validateLogin,
  validateRefreshToken,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateCompleteOnboarding,
} from "./auth.validation.js";

const router = Router();

router.post(
  "/register",
  authRateLimitMiddleware,
  validateRequest(validateRegister),
  authController.register
);

router.post(
  "/register-business",
  authRateLimitMiddleware,
  validateRequest(validateRegisterBusiness),
  authController.registerBusiness
);

router.post(
  "/login",
  authRateLimitMiddleware,
  validateRequest(validateLogin),
  authController.login
);

router.post(
  "/refresh-token",
  validateRequest(validateRefreshToken),
  authController.refreshToken
);

router.get("/me", authMiddleware, authController.getMe);
router.post("/logout", authMiddleware, authController.logout);
router.post(
  "/change-password",
  authMiddleware,
  validateRequest(validateChangePassword),
  authController.changePassword
);
router.post(
  "/forgot-password",
  authRateLimitMiddleware,
  validateRequest(validateForgotPassword),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  authRateLimitMiddleware,
  validateRequest(validateResetPassword),
  authController.resetPassword
);
router.post(
  "/google",
  authRateLimitMiddleware,
  authController.googleAuth
);
router.post(
  "/complete-onboarding",
  authMiddleware,
  validateRequest(validateCompleteOnboarding),
  authController.completeOnboarding
);

export { router as authRoutes };
export default router;

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
router.patch("/change-password", authMiddleware, authController.changePassword);

export { router as authRoutes };
export default router;

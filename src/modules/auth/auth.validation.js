import { isValidEmail } from "../../shared/validators/common.validation.js";

export const validateRegister = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Full name is required (at least 2 characters)" });
  }
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Valid email address is required" });
  }
  if (!data.password || typeof data.password !== "string" || data.password.length < 6) {
    errors.push({ field: "password", message: "Password must be at least 6 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateRegisterBusiness = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Owner name is required" });
  }
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Valid email address is required" });
  }
  if (!data.password || typeof data.password !== "string" || data.password.length < 6) {
    errors.push({ field: "password", message: "Password must be at least 6 characters" });
  }
  if (!data.businessName || typeof data.businessName !== "string" || data.businessName.trim().length < 2) {
    errors.push({ field: "businessName", message: "Business name is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateLogin = (data = {}) => {
  const errors = [];
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Valid email address is required" });
  }
  if (!data.password || typeof data.password !== "string") {
    errors.push({ field: "password", message: "Password is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateRefreshToken = (data = {}) => {
  const errors = [];
  if (!data.refreshToken || typeof data.refreshToken !== "string") {
    errors.push({ field: "refreshToken", message: "Refresh token is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateChangePassword = (data = {}) => {
  const errors = [];
  if (!data.currentPassword || typeof data.currentPassword !== "string") {
    errors.push({ field: "currentPassword", message: "Current password is required" });
  }
  if (!data.newPassword || typeof data.newPassword !== "string" || data.newPassword.length < 6) {
    errors.push({ field: "newPassword", message: "New password must be at least 6 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateForgotPassword = (data = {}) => {
  const errors = [];
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "A valid email address is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateResetPassword = (data = {}) => {
  const errors = [];
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "A valid email address is required" });
  }
  if (!data.resetToken || typeof data.resetToken !== "string") {
    errors.push({ field: "resetToken", message: "Verification code is required" });
  }
  if (!data.newPassword || typeof data.newPassword !== "string" || data.newPassword.length < 6) {
    errors.push({ field: "newPassword", message: "New password must be at least 6 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateCompleteOnboarding = (data = {}) => {
  const errors = [];
  if (!data.password || typeof data.password !== "string" || data.password.length < 6) {
    errors.push({ field: "password", message: "Password must be at least 6 characters" });
  }
  if (!data.phone || typeof data.phone !== "string" || data.phone.trim().length < 5) {
    errors.push({ field: "phone", message: "A valid phone number is required" });
  }
  if (data.role === "business_owner") {
    if (!data.businessName || typeof data.businessName !== "string" || data.businessName.trim().length < 2) {
      errors.push({ field: "businessName", message: "Business name is required" });
    }
  }
  return { valid: errors.length === 0, errors };
};

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

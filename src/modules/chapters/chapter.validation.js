import { isValidEmail, isValidPhone, isValidName } from "../../shared/validators/common.validation.js";

export const validateCreateChapter = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Chapter name is required" });
  }
  if (!data.city || typeof data.city !== "string") {
    errors.push({ field: "city", message: "City is required" });
  }
  if (!data.state || typeof data.state !== "string") {
    errors.push({ field: "state", message: "State is required" });
  }
  if (data.adminName !== undefined && data.adminName !== "" && !isValidName(data.adminName)) {
    errors.push({ field: "adminName", message: "Admin name must contain only letters" });
  }
  if (data.adminEmail !== undefined && data.adminEmail !== "" && !isValidEmail(data.adminEmail)) {
    errors.push({ field: "adminEmail", message: "Enter a valid email address" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateChapter = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Chapter name must be at least 2 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateAssignChapterAdmin = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && data.name !== "" && !isValidName(data.name)) {
    errors.push({ field: "name", message: "Name must contain only letters" });
  }
  if (data.email !== undefined && data.email !== "" && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateAddUnit = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Unit name is required" });
  }
  return { valid: errors.length === 0, errors };
};

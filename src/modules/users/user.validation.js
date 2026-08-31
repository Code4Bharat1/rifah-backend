import { isValidEmail, isValidPhone } from "../../shared/validators/common.validation.js";

export const validateUpdateProfile = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Name must be at least 2 characters" });
  }
  if (data.email !== undefined && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Invalid email format" });
  }
  if (data.phone !== undefined && data.phone !== "" && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Invalid phone number" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateStatus = (data = {}) => {
  const errors = [];
  const allowed = ["Active", "Pending", "Suspended", "Deactivated"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

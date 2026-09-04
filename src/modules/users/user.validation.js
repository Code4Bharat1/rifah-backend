import { isValidEmail, isValidPhone } from "../../shared/validators/common.validation.js";

export const validateUpdateProfile = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Name must be at least 2 characters" });
  }
  if (data.email !== undefined && data.email !== "" && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Invalid email format" });
  }
  if (data.phone !== undefined && data.phone !== "" && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Invalid phone number" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateStatus = (data = {}) => {
  const errors = [];
  
  if (data.status) {
    const allowedStatuses = ["Active", "Pending", "Suspended", "Deactivated"];
    if (!allowedStatuses.includes(data.status)) {
      errors.push({ field: "status", message: `Status must be one of: ${allowedStatuses.join(", ")}` });
    }
  }

  if (data.role) {
    const allowedRoles = ["customer", "business_owner", "chapter_admin", "secretariat", "super_admin"];
    if (!allowedRoles.includes(data.role)) {
      errors.push({ field: "role", message: `Role must be one of: ${allowedRoles.join(", ")}` });
    }
  }

  if (!data.status && !data.role) {
    errors.push({ field: "body", message: "Must provide status or role to update" });
  }

  return { valid: errors.length === 0, errors };
};

export const validateInvite = (data = {}) => {
  const errors = [];
  if (!data.email || !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "A valid email is required" });
  }
  return { valid: errors.length === 0, errors };
};

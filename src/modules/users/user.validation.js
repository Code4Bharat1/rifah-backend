import { isValidEmail, isValidPhone, isValidName } from "../../shared/validators/common.validation.js";

export const validateUpdateProfile = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && !isValidName(data.name)) {
    errors.push({ field: "name", message: "Name must contain only letters and be at least 2 characters" });
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
    // Admin tiers (chapter_admin/state_admin/central_admin) can only be granted through
    // their dedicated, eligibility-checked assignment endpoints — never through this
    // generic status endpoint, which would otherwise let any state/central admin
    // promote an arbitrary user with zero paid/verified checks.
    const allowedRoles = ["customer", "business_owner"];
    if (!allowedRoles.includes(data.role)) {
      errors.push({ field: "role", message: `This endpoint can only set role to one of: ${allowedRoles.join(", ")}. Use the dedicated admin-assignment endpoints to grant admin roles.` });
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

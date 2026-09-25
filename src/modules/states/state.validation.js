import { isValidEmail, isValidPhone, isValidName } from "../../shared/validators/common.validation.js";

/**
 * Validates payload for PUT /states/:stateName/profile
 * (State profile edit — image, address, phone, email)
 */
export const validateUpdateStateProfile = (data = {}) => {
  const errors = [];
  if (data.email !== undefined && data.email !== "" && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }
  if (data.phone !== undefined && data.phone !== "" && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Enter a valid phone number" });
  }
  return { valid: errors.length === 0, errors };
};

/**
 * Validates payload for POST /states/assign-admin
 * (State page: allocating / relocating a State Admin)
 */
export const validateAssignStateAdmin = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && data.name !== "" && !isValidName(data.name)) {
    errors.push({ field: "name", message: "Name must contain only letters" });
  }
  if (data.email !== undefined && data.email !== "" && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }
  if (data.contactEmail !== undefined && data.contactEmail !== "" && !isValidEmail(data.contactEmail)) {
    errors.push({ field: "contactEmail", message: "Enter a valid email address" });
  }
  if (data.phone !== undefined && data.phone !== "" && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Enter a valid phone number" });
  }
  if (data.contactPhone !== undefined && data.contactPhone !== "" && !isValidPhone(data.contactPhone)) {
    errors.push({ field: "contactPhone", message: "Enter a valid phone number" });
  }
  return { valid: errors.length === 0, errors };
};

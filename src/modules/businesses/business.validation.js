import { isValidEmail, isValidPhone, isValidPincode } from "../../shared/validators/common.validation.js";

const validateContactFields = (data, errors) => {
  if (data.email !== undefined && data.email !== "" && !isValidEmail(data.email)) {
    errors.push({ field: "email", message: "Enter a valid email address" });
  }
  if (data.phone !== undefined && data.phone !== "" && !isValidPhone(data.phone)) {
    errors.push({ field: "phone", message: "Enter a valid phone number" });
  }
  if (data.whatsapp !== undefined && data.whatsapp !== "" && !isValidPhone(data.whatsapp)) {
    errors.push({ field: "whatsapp", message: "Enter a valid WhatsApp number" });
  }
  if (data.whatsappNumber !== undefined && data.whatsappNumber !== "" && !isValidPhone(data.whatsappNumber)) {
    errors.push({ field: "whatsappNumber", message: "Enter a valid WhatsApp number" });
  }
  const isInternational = data.region === "international" || data.currency === "USD" || (data.state && String(data.state).toLowerCase() === "international");
  if (data.pincode !== undefined && data.pincode !== "") {
    if (!isInternational && !isValidPincode(data.pincode)) {
      errors.push({ field: "pincode", message: "Enter a valid 6-digit PIN code" });
    } else if (isInternational && typeof data.pincode === "string" && data.pincode.trim().length > 16) {
      errors.push({ field: "pincode", message: "Enter a valid postal / zip code" });
    }
  }
};

export const validateCreateBusiness = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Business name is required" });
  }
  validateContactFields(data, errors);
  return { valid: errors.length === 0, errors };
};

export const validateUpdateBusiness = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Business name must be at least 2 characters" });
  }
  validateContactFields(data, errors);
  return { valid: errors.length === 0, errors };
};

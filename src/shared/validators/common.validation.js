export const VALIDATION_PATTERNS = Object.freeze({
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  GST_NUMBER: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  PAN_NUMBER: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  PINCODE: /^[1-9][0-9]{5}$/,
  NAME: /^[A-Za-z][A-Za-z\s.'-]{1,99}$/,
});

export const isValidEmail = (email) => {
  return Boolean(email && VALIDATION_PATTERNS.EMAIL.test(String(email).toLowerCase()));
};

export const isValidPhone = (phone) => {
  if (!phone) return false;
  const cleanPhone = String(phone).replace(/[\s\-()]/g, "");
  return VALIDATION_PATTERNS.PHONE.test(cleanPhone);
};

export const isValidName = (name) => {
  return Boolean(name && VALIDATION_PATTERNS.NAME.test(String(name).trim()));
};

export const isValidPincode = (pincode) => {
  return Boolean(pincode && VALIDATION_PATTERNS.PINCODE.test(String(pincode).trim()));
};

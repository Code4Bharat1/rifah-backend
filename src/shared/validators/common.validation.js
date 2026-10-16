export const VALIDATION_PATTERNS = Object.freeze({
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{6,14}$/, // E.164: 7-15 digits total
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  GST_NUMBER: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  PAN_NUMBER: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  PINCODE: /^[1-9][0-9]{5}$/,
  NAME: /^[A-Za-z][A-Za-z\s.'-]{1,99}$/,
});

export const DISPOSABLE_OR_DUMMY_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "throwaway.com",
  "guerrillamail.com",
  "yopmail.com",
  "dispostable.com",
  "trashmail.com",
  "sharklasers.com",
  "getairmail.com",
  "fake.com",
  "dummy.com",
]);

export const DUMMY_USERNAMES = new Set([
  "test",
  "tester",
  "testing",
  "dummy",
  "fake",
  "sample",
  "asdf",
  "asdfgh",
  "qwerty",
  "temp",
  "random",
  "null",
  "undefined",
  "trtrtr",
  "foobar",
  "noname",
]);

/**
 * Validates whether an email is properly formatted and not an obvious fake, dummy, or disposable address.
 */
export const validateLegitimateEmail = (email) => {
  if (!email || typeof email !== "string") {
    return { valid: false, message: "Please enter an email address." };
  }
  const clean = email.trim().toLowerCase();

  // Strict RFC-compliant standard email syntax check
  const standardEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!standardEmailRegex.test(clean) || clean.includes("..")) {
    return { valid: false, message: "Please enter a valid email format (e.g. name@domain.com)." };
  }

  const [localPart, domain] = clean.split("@");
  if (!localPart || !domain) {
    return { valid: false, message: "Please enter a valid email address." };
  }

  if (localPart.length < 2) {
    return { valid: false, message: "Email username is too short." };
  }

  // Check known disposable domains
  if (DISPOSABLE_OR_DUMMY_DOMAINS.has(domain)) {
    return { valid: false, message: "Temporary or disposable email domains are not allowed." };
  }

  // Check known dummy usernames
  if (DUMMY_USERNAMES.has(localPart)) {
    return { valid: false, message: "Dummy or generic test usernames are not allowed. Please enter your real email." };
  }

  // Check repeated single character (e.g. aaaa, 1111)
  if (/^(.)\1{3,}$/.test(localPart)) {
    return { valid: false, message: "Repeated character email addresses are not permitted." };
  }

  // Check repeated 2-4 char syllables (e.g. trtrtr, abcabcabc, lalala)
  if (/^([a-zA-Z0-9]{2,4})\1{2,}$/.test(localPart)) {
    return { valid: false, message: "Repetitive or dummy email usernames are not permitted." };
  }

  // Check absence of vowels or digits in local part if >= 5 characters (e.g. trtrtr, bcdfgh, etc.)
  if (localPart.length >= 5 && !/[aeiouy0-9]/i.test(localPart)) {
    return { valid: false, message: "Please enter a valid, active email address." };
  }

  return { valid: true };
};

export const isValidEmail = (email) => {
  return Boolean(email && validateLegitimateEmail(email).valid);
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

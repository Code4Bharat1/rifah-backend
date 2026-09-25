import { isValidEmail, isValidPhone, isValidName } from "../../shared/validators/common.validation.js";

export const validateCreateEnquiry = (data = {}, req = null) => {
  const errors = [];
  if (!data.title || typeof data.title !== "string" || !data.title.trim()) {
    errors.push({ field: "title", message: "Requirement title is required" });
  }
  if (!data.category || typeof data.category !== "string") {
    errors.push({ field: "category", message: "Category is required" });
  }
  if (!data.quantity || typeof data.quantity !== "string") {
    errors.push({ field: "quantity", message: "Quantity is required" });
  }
  if (!data.location || typeof data.location !== "string") {
    errors.push({ field: "location", message: "Delivery location is required" });
  }
  if (!data.requiredBy || typeof data.requiredBy !== "string") {
    errors.push({ field: "requiredBy", message: "Required-by timeline is required" });
  }
  if (data.description && typeof data.description !== "string") {
    errors.push({ field: "description", message: "Description must be a valid text string" });
  }
  if (data.targetType && !["all", "chamber", "business"].includes(data.targetType)) {
    errors.push({ field: "targetType", message: "targetType must be one of: all, chamber, business" });
  }
  if (data.targetType === "chamber" && (!data.chapter || typeof data.chapter !== "string" || !data.chapter.trim())) {
    errors.push({ field: "chapter", message: "Chapter is required when targeting a specific chamber" });
  }
  if (data.targetType === "business" && (!data.targetBusiness || !/^[0-9a-fA-F]{24}$/.test(String(data.targetBusiness)))) {
    errors.push({ field: "targetBusiness", message: "Valid target business ID is required when targeting a specific business" });
  }
  // Guest contact validation — when targeting a business without auth, guest must provide name + email
  if (data.targetType === "business" && data.targetBusiness) {
    const isAuthenticated = Boolean(req?.user);
    if (!isAuthenticated) {
      const hasName = data.guestName?.trim() || data.name?.trim() || data.senderName?.trim();
      const hasEmail = data.guestEmail?.trim() || data.email?.trim() || data.senderEmail?.trim();
      if (!hasName) {
        errors.push({ field: "guestName", message: "Your name is required for direct business enquiries" });
      }
      if (!hasEmail) {
        errors.push({ field: "guestEmail", message: "Your email is required for direct business enquiries" });
      }
    }
  }
  // BUG-001/002/003: RFQ/contact form guest name, email and phone were accepted with
  // no format validation whenever provided (previously only presence was checked).
  const guestName = data.guestName ?? data.name ?? data.senderName;
  if (guestName !== undefined && guestName !== "" && !isValidName(guestName)) {
    errors.push({ field: "guestName", message: "Name must contain only letters" });
  }
  const guestEmail = data.guestEmail ?? data.email ?? data.senderEmail;
  if (guestEmail !== undefined && guestEmail !== "" && !isValidEmail(guestEmail)) {
    errors.push({ field: "guestEmail", message: "Enter a valid email address" });
  }
  const guestPhone = data.guestPhone ?? data.phone ?? data.senderPhone;
  if (guestPhone !== undefined && guestPhone !== "" && !isValidPhone(guestPhone)) {
    errors.push({ field: "guestPhone", message: "Enter a valid phone number" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateEnquiryStatus = (data = {}) => {
  const errors = [];
  const allowed = ["New", "Routed", "In Progress", "Responded", "Won", "Closed", "Rejected", "Escalated"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

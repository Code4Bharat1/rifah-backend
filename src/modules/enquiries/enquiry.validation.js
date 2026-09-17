export const validateCreateEnquiry = (data = {}) => {
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
    if (!data.guestName || typeof data.guestName !== "string" || !data.guestName.trim()) {
      errors.push({ field: "guestName", message: "Your name is required for direct business enquiries" });
    }
    if (!data.guestEmail || typeof data.guestEmail !== "string" || !data.guestEmail.trim()) {
      errors.push({ field: "guestEmail", message: "Your email is required for direct business enquiries" });
    }
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

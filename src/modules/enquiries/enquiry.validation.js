export const validateCreateEnquiry = (data = {}) => {
  const errors = [];
  if (!data.title || typeof data.title !== "string" || data.title.trim().length < 3) {
    errors.push({ field: "title", message: "Enquiry title is required" });
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
  if (!data.description || typeof data.description !== "string" || data.description.trim().length < 10) {
    errors.push({ field: "description", message: "Description must be at least 10 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateEnquiryStatus = (data = {}) => {
  const errors = [];
  const allowed = ["New", "Routed", "In Progress", "Responded", "Won", "Closed", "Rejected"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

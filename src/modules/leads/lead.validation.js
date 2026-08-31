export const validateRouteLead = (data = {}) => {
  const errors = [];
  if (!data.enquiryId) {
    errors.push({ field: "enquiryId", message: "Enquiry ID is required" });
  }
  if (!data.businessIds || !Array.isArray(data.businessIds) || data.businessIds.length === 0) {
    errors.push({ field: "businessIds", message: "At least one business ID is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateSubmitQuotation = (data = {}) => {
  const errors = [];
  if (!data.amount || typeof data.amount !== "string") {
    errors.push({ field: "amount", message: "Quotation amount is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateLeadStatus = (data = {}) => {
  const errors = [];
  const allowed = ["New", "In Progress", "Responded", "Negotiation", "Won", "Lost", "Closed"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

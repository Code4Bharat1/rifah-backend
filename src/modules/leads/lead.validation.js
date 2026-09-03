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
  const amountStr = data.amount !== undefined && data.amount !== null ? String(data.amount).trim() : "";
  if (!amountStr || isNaN(Number(amountStr)) || Number(amountStr) <= 0) {
    errors.push({ field: "amount", message: "A valid quotation amount is required" });
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

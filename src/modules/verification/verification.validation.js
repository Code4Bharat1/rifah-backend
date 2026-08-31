export const validateSubmitVerification = (data = {}) => {
  const errors = [];
  if (!data.businessId) {
    errors.push({ field: "businessId", message: "Business ID is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateReviewVerification = (data = {}) => {
  const errors = [];
  const allowed = ["verified", "rejected", "correction_requested", "under_review"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

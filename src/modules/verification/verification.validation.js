export const validateSubmitVerification = (data = {}) => {
  const errors = [];
  if (!data.businessId) {
    errors.push({ field: "businessId", message: "Business ID is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateReviewVerification = (data = {}) => {
  const errors = [];
  const statusOrDecision = data.status || data.decision;
  const allowed = ["verified", "approved", "rejected", "correction_requested", "correction", "under_review"];
  if (!statusOrDecision || !allowed.includes(statusOrDecision)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

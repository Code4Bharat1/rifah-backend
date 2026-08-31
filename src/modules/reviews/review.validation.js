export const validateSubmitReview = (data = {}) => {
  const errors = [];
  if (!data.businessId) {
    errors.push({ field: "businessId", message: "Business ID is required" });
  }
  if (!data.rating || typeof data.rating !== "number" || data.rating < 1 || data.rating > 5) {
    errors.push({ field: "rating", message: "Rating must be between 1 and 5" });
  }
  if (!data.body || typeof data.body !== "string" || data.body.trim().length < 5) {
    errors.push({ field: "body", message: "Review body must be at least 5 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateModerateReview = (data = {}) => {
  const errors = [];
  const allowed = ["approved", "rejected", "pending"];
  if (!data.status || !allowed.includes(data.status)) {
    errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

export const validateCreatePayment = (data = {}) => {
  const errors = [];
  if (!data.amount || typeof data.amount !== "number" || data.amount <= 0) {
    errors.push({ field: "amount", message: "Valid positive payment amount is required" });
  }
  return { valid: errors.length === 0, errors };
};

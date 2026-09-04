export const validateUpgradePlan = (data = {}) => {
  const errors = [];
  if (!data.planId) {
    errors.push({ field: "planId", message: "planId is required" });
  }
  return { valid: errors.length === 0, errors };
};

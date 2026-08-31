export const validateUpgradePlan = (data = {}) => {
  const errors = [];
  const allowedPlans = ["free", "basic", "premium", "enterprise"];
  if (!data.planId || !allowedPlans.includes(data.planId)) {
    errors.push({ field: "planId", message: `Plan must be one of: ${allowedPlans.join(", ")}` });
  }
  return { valid: errors.length === 0, errors };
};

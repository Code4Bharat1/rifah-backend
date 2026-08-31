export const validateCreateCategory = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Category name is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateCategory = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Category name must be at least 2 characters" });
  }
  return { valid: errors.length === 0, errors };
};

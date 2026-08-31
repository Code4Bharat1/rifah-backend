export const validateCreateCatalogueItem = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Product/Service name is required" });
  }
  if (!data.category || typeof data.category !== "string") {
    errors.push({ field: "category", message: "Category is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateCatalogueItem = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Name must be at least 2 characters" });
  }
  return { valid: errors.length === 0, errors };
};

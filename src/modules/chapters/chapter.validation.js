export const validateCreateChapter = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Chapter name is required" });
  }
  if (!data.city || typeof data.city !== "string") {
    errors.push({ field: "city", message: "City is required" });
  }
  if (!data.state || typeof data.state !== "string") {
    errors.push({ field: "state", message: "State is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateChapter = (data = {}) => {
  const errors = [];
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
    errors.push({ field: "name", message: "Chapter name must be at least 2 characters" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateAddUnit = (data = {}) => {
  const errors = [];
  if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Unit name is required" });
  }
  return { valid: errors.length === 0, errors };
};

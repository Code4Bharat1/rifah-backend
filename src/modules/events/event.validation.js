export const validateCreateEvent = (data = {}) => {
  const errors = [];
  if (!data.title || typeof data.title !== "string" || data.title.trim().length < 3) {
    errors.push({ field: "title", message: "Event title is required" });
  }
  if (!data.date || typeof data.date !== "string") {
    errors.push({ field: "date", message: "Event date is required" });
  }
  if (!data.venue || typeof data.venue !== "string") {
    errors.push({ field: "venue", message: "Venue details are required" });
  }
  if (!data.city || typeof data.city !== "string") {
    errors.push({ field: "city", message: "City is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateEvent = (data = {}) => {
  const errors = [];
  if (data.title !== undefined && (typeof data.title !== "string" || data.title.trim().length < 3)) {
    errors.push({ field: "title", message: "Event title must be at least 3 characters" });
  }
  return { valid: errors.length === 0, errors };
};

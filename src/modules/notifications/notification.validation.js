export const validateCreateNotification = (data = {}) => {
  const errors = [];
  if (!data.recipientId) {
    errors.push({ field: "recipientId", message: "Recipient ID is required" });
  }
  if (!data.title || typeof data.title !== "string") {
    errors.push({ field: "title", message: "Notification title is required" });
  }
  if (!data.body || typeof data.body !== "string") {
    errors.push({ field: "body", message: "Notification body is required" });
  }
  return { valid: errors.length === 0, errors };
};

export const validateSendMessage = (data = {}) => {
  const errors = [];
  if (!data.recipientId) {
    errors.push({ field: "recipientId", message: "Recipient ID is required" });
  }
  if (!data.text || typeof data.text !== "string" || data.text.trim().length === 0) {
    errors.push({ field: "text", message: "Message text cannot be empty" });
  }
  return { valid: errors.length === 0, errors };
};

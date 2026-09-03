export const validateSendMessage = (data = {}) => {
  const errors = [];
  if (!data.recipientId) {
    errors.push({ field: "recipientId", message: "Recipient ID is required" });
  }
  const messageText = data.text || data.body;
  const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;
  if ((!messageText || typeof messageText !== "string" || messageText.trim().length === 0) && !hasAttachments) {
    errors.push({ field: "text", message: "Message text or file attachment is required" });
  }
  return { valid: errors.length === 0, errors };
};

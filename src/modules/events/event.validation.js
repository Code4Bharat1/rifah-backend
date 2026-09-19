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
  if (data.mode !== "Online" && (!data.city || typeof data.city !== "string" || !data.city.trim())) {
    errors.push({ field: "city", message: "City is required" });
  }
  if (data.targetAudience !== undefined && !Array.isArray(data.targetAudience)) {
    errors.push({ field: "targetAudience", message: "Target audience must be an array" });
  }
  const isPaid = data.isPaid === true || data.isPaid === "true" || data.isPaid === "Paid";
  if (isPaid) {
    const price = Number(data.ticketPrice);
    if (isNaN(price) || price < 0 || data.ticketPrice === "" || data.ticketPrice === undefined || data.ticketPrice === null) {
      errors.push({ field: "ticketPrice", message: "Ticket price must be a valid number for paid events" });
    }
    const memPrice = Number(data.memberPrice);
    if (!isNaN(memPrice) && memPrice < 0) {
      errors.push({ field: "memberPrice", message: "Member price cannot be negative" });
    }
  }
  return { valid: errors.length === 0, errors };
};

export const validateUpdateEvent = (data = {}) => {
  const errors = [];
  if (data.title !== undefined && (typeof data.title !== "string" || data.title.trim().length < 3)) {
    errors.push({ field: "title", message: "Event title must be at least 3 characters" });
  }
  if (data.isPaid !== undefined) {
    const isPaid = data.isPaid === true || data.isPaid === "true" || data.isPaid === "Paid";
    if (isPaid && data.ticketPrice !== undefined) {
      const price = Number(data.ticketPrice);
      if (isNaN(price) || price < 0) {
        errors.push({ field: "ticketPrice", message: "Ticket price must be a valid number for paid events" });
      }
    }
    if (isPaid && data.memberPrice !== undefined) {
      const memPrice = Number(data.memberPrice);
      if (isNaN(memPrice) || memPrice < 0) {
        errors.push({ field: "memberPrice", message: "Member price cannot be negative" });
      }
    }
  }
  return { valid: errors.length === 0, errors };
};

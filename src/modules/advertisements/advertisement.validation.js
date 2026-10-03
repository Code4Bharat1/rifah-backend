export const validateCreateAdvertisement = (data = {}) => {
  const errors = [];

  // Title: Required, 3 to 100 characters
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!title) {
    errors.push({ field: "title", message: "Advertisement title is required." });
  } else if (title.length < 3) {
    errors.push({ field: "title", message: "Title must be at least 3 characters." });
  } else if (title.length > 100) {
    errors.push({ field: "title", message: "Title cannot exceed 100 characters." });
  }

  // Description: Optional, max 500 characters
  if (data.description && typeof data.description === "string") {
    if (data.description.trim().length > 500) {
      errors.push({ field: "description", message: "Description cannot exceed 500 characters." });
    }
  }

  // Target Scope: Must be chapter, state, or global
  const allowedScopes = ["chapter", "state", "global"];
  const targetScope = data.targetScope ? String(data.targetScope).toLowerCase().trim() : "chapter";
  if (!allowedScopes.includes(targetScope)) {
    errors.push({
      field: "targetScope",
      message: `Target scope must be one of: ${allowedScopes.join(", ")}.`,
    });
  }

  // Link URL: Optional, but if provided must be a valid URL or internal path
  if (data.linkUrl && typeof data.linkUrl === "string") {
    const link = data.linkUrl.trim();
    if (link.length > 0) {
      const isValidUrl =
        /^https?:\/\/.+/i.test(link) ||
        link.startsWith("/") ||
        /^wa\.me\/.+/i.test(link);
      if (!isValidUrl) {
        errors.push({
          field: "linkUrl",
          message: "Destination link must be a valid URL (https://...) or relative link (/...).",
        });
      }
      if (link.length > 500) {
        errors.push({ field: "linkUrl", message: "Link URL cannot exceed 500 characters." });
      }
    }
  }

  // Requested Date: If provided, must not be in the past
  if (data.requestedDate) {
    const parsedDate = new Date(data.requestedDate);
    if (isNaN(parsedDate.getTime())) {
      errors.push({ field: "requestedDate", message: "Requested date is invalid." });
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const testDate = new Date(parsedDate);
      testDate.setHours(0, 0, 0, 0);
      if (testDate < today) {
        errors.push({
          field: "requestedDate",
          message: "Requested advertisement date cannot be in the past.",
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

export const validateReviewAdvertisement = (data = {}) => {
  const errors = [];

  // Action: Must be APPROVE or REJECT
  const action = String(data.action || "").toUpperCase().trim();
  if (!["APPROVE", "REJECT"].includes(action)) {
    errors.push({ field: "action", message: "Review action must be APPROVE or REJECT." });
  }

  // If Reject: Admin remarks are mandatory
  if (action === "REJECT") {
    const remarks = typeof data.adminRemarks === "string" ? data.adminRemarks.trim() : "";
    if (!remarks) {
      errors.push({
        field: "adminRemarks",
        message: "Please provide a reason or remarks for rejecting this advertisement.",
      });
    } else if (remarks.length < 5) {
      errors.push({
        field: "adminRemarks",
        message: "Rejection remarks must be at least 5 characters.",
      });
    } else if (remarks.length > 500) {
      errors.push({
        field: "adminRemarks",
        message: "Remarks cannot exceed 500 characters.",
      });
    }
  }

  // If Approve: Validate duration and approved start date
  if (action === "APPROVE") {
    if (data.durationDays !== undefined) {
      const duration = parseInt(data.durationDays, 10);
      if (isNaN(duration) || duration < 1 || duration > 30) {
        errors.push({
          field: "durationDays",
          message: "Slot duration must be between 1 and 30 days.",
        });
      }
    }

    if (data.approvedStartDate) {
      const parsedStart = new Date(data.approvedStartDate);
      if (isNaN(parsedStart.getTime())) {
        errors.push({
          field: "approvedStartDate",
          message: "Approved start date is invalid.",
        });
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const testDate = new Date(parsedStart);
        testDate.setHours(0, 0, 0, 0);
        if (testDate < today) {
          errors.push({
            field: "approvedStartDate",
            message: "Slot start date cannot be in the past.",
          });
        }
      }
    }

    if (data.adminRemarks && typeof data.adminRemarks === "string") {
      if (data.adminRemarks.trim().length > 500) {
        errors.push({
          field: "adminRemarks",
          message: "Admin remarks cannot exceed 500 characters.",
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
};

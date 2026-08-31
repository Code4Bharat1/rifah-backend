export const STATUSES = Object.freeze({
  USER: {
    ACTIVE: "Active",
    PENDING: "Pending",
    SUSPENDED: "Suspended",
    DEACTIVATED: "Deactivated",
  },

  VERIFICATION: {
    UNVERIFIED: "unverified",
    PENDING: "pending",
    UNDER_REVIEW: "under_review",
    CORRECTION_REQUESTED: "correction_requested",
    VERIFIED: "verified",
    REJECTED: "rejected",
  },

  ENQUIRY: {
    NEW: "New",
    ROUTED: "Routed",
    IN_PROGRESS: "In Progress",
    RESPONDED: "Responded",
    WON: "Won",
    CLOSED: "Closed",
    REJECTED: "Rejected",
  },

  LEAD: {
    NEW: "New",
    IN_PROGRESS: "In Progress",
    RESPONDED: "Responded",
    NEGOTIATION: "Negotiation",
    WON: "Won",
    LOST: "Lost",
    CLOSED: "Closed",
  },

  MEMBERSHIP: {
    ACTIVE: "Active",
    EXPIRED: "Expired",
    GRACE_PERIOD: "Grace Period",
    CANCELLED: "Cancelled",
  },

  PAYMENT: {
    PAID: "Paid",
    PENDING: "Pending",
    FAILED: "Failed",
    REFUNDED: "Refunded",
  },

  REVIEW: {
    PENDING: "pending",
    APPROVED: "approved",
    REJECTED: "rejected",
  },

  EVENT: {
    UPCOMING: "Upcoming",
    ONGOING: "Ongoing",
    COMPLETED: "Completed",
    PAST: "Past",
    CANCELLED: "Cancelled",
  },
});

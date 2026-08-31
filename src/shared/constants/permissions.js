export const PERMISSIONS = Object.freeze({
  // Business Management
  BUSINESS_CREATE: "business:create",
  BUSINESS_READ: "business:read",
  BUSINESS_UPDATE: "business:update",
  BUSINESS_DELETE: "business:delete",
  BUSINESS_VERIFY: "business:verify",

  // Catalogue
  CATALOGUE_CREATE: "catalogue:create",
  CATALOGUE_READ: "catalogue:read",
  CATALOGUE_UPDATE: "catalogue:update",
  CATALOGUE_DELETE: "catalogue:delete",

  // Enquiries & Leads
  ENQUIRY_CREATE: "enquiry:create",
  ENQUIRY_READ: "enquiry:read",
  ENQUIRY_UPDATE: "enquiry:update",
  LEAD_ASSIGN: "lead:assign",
  LEAD_RESPOND: "lead:respond",

  // Memberships & Payments
  MEMBERSHIP_MANAGE: "membership:manage",
  PAYMENT_PROCESS: "payment:process",
  PAYMENT_REFUND: "payment:refund",

  // Chapters
  CHAPTER_MANAGE: "chapter:manage",

  // Events & Content
  EVENT_MANAGE: "event:manage",
  REVIEW_MODERATE: "review:moderate",
  AUDIT_READ: "audit:read",
  REPORTS_READ: "reports:read",
  SETTINGS_MANAGE: "settings:manage",
});

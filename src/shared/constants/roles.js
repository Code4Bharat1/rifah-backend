export const ROLES = Object.freeze({
  CENTRAL_ADMIN: "central_admin",
  // The frontend has always treated secretariat as central_admin's equal (same /admin
  // panel, same isSuperAdmin checks) but the backend never defined it - any account with
  // this role failed every requireRole()/getChapterFilter() check. requireRole() and
  // getChapterFilter() now normalize SECRETARIAT to CENTRAL_ADMIN for authorization.
  SECRETARIAT: "secretariat",
  STATE_ADMIN: "state_admin",
  CHAPTER_ADMIN: "chapter_admin",
  BUSINESS_OWNER: "business_owner",
  CUSTOMER: "customer",
  PUBLIC: "public",
});

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.CENTRAL_ADMIN]: 100,
  [ROLES.SECRETARIAT]: 100,
  [ROLES.STATE_ADMIN]: 80,
  [ROLES.CHAPTER_ADMIN]: 60,
  [ROLES.BUSINESS_OWNER]: 40,
  [ROLES.CUSTOMER]: 20,
  [ROLES.PUBLIC]: 0,
});

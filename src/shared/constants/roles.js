export const ROLES = Object.freeze({
  CENTRAL_ADMIN: "central_admin",
<<<<<<< Updated upstream
=======
  SUPER_ADMIN: "central_admin", // alias for backwards compatibility
  ADMIN: "central_admin", // alias for backwards compatibility
>>>>>>> Stashed changes
  STATE_ADMIN: "state_admin",
  CHAPTER_ADMIN: "chapter_admin",
  BUSINESS_OWNER: "business_owner",
  CUSTOMER: "customer",
  PUBLIC: "public",
});

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.CENTRAL_ADMIN]: 100,
<<<<<<< Updated upstream
=======
  super_admin: 100,
  admin: 100,
>>>>>>> Stashed changes
  [ROLES.STATE_ADMIN]: 80,
  [ROLES.CHAPTER_ADMIN]: 60,
  [ROLES.BUSINESS_OWNER]: 40,
  [ROLES.CUSTOMER]: 20,
  [ROLES.PUBLIC]: 0,
});

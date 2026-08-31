export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  SECRETARIAT: "secretariat",
  CHAPTER_ADMIN: "chapter_admin",
  BUSINESS_OWNER: "business_owner",
  CUSTOMER: "customer",
  PUBLIC: "public",
});

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SUPER_ADMIN]: 100,
  [ROLES.SECRETARIAT]: 80,
  [ROLES.CHAPTER_ADMIN]: 60,
  [ROLES.BUSINESS_OWNER]: 40,
  [ROLES.CUSTOMER]: 20,
  [ROLES.PUBLIC]: 0,
});

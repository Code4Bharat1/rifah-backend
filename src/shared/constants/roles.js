export const ROLES = Object.freeze({
  CENTRAL_ADMIN: "central_admin",
  // The frontend treats secretariat as central_admin's equal
  SECRETARIAT: "secretariat",
  SUPER_ADMIN: "central_admin", // alias for backwards compatibility
  ADMIN: "central_admin", // alias for backwards compatibility
  COUNTRY_ADMIN: "country_admin",
  STATE_ADMIN: "state_admin",
  CHAPTER_ADMIN: "chapter_admin",
  GUEST_SPEAKER_MANAGER: "guest_speaker_manager",
  GUEST_MANAGER: "guestManager",
  EVENT_COORDINATOR: "event_coordinator",
  EVENT_COORDINATOR_CAMEL: "eventCoordinator",
  BUSINESS_OWNER: "business_owner",
  CUSTOMER: "customer",
  BUYER: "buyer",
  PUBLIC: "public",
});

export const RESPONSIBILITY_ROLES = Object.freeze([
  ROLES.CENTRAL_ADMIN,
  ROLES.SECRETARIAT,
  ROLES.COUNTRY_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.CHAPTER_ADMIN,
  ROLES.GUEST_SPEAKER_MANAGER,
  ROLES.GUEST_MANAGER,
  ROLES.EVENT_COORDINATOR,
  ROLES.EVENT_COORDINATOR_CAMEL,
]);

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.CENTRAL_ADMIN]: 100,
  [ROLES.SECRETARIAT]: 100,
  super_admin: 100,
  admin: 100,
  [ROLES.COUNTRY_ADMIN]: 85,
  [ROLES.STATE_ADMIN]: 80,
  [ROLES.CHAPTER_ADMIN]: 60,
  [ROLES.GUEST_SPEAKER_MANAGER]: 55,
  guest_speaker_manager: 55,
  guestManager: 55,
  [ROLES.EVENT_COORDINATOR]: 55,
  event_coordinator: 55,
  eventCoordinator: 55,
  [ROLES.BUSINESS_OWNER]: 40,
  [ROLES.CUSTOMER]: 20,
  [ROLES.BUYER]: 20,
  buyer: 20,
  [ROLES.PUBLIC]: 0,
});

export const isResponsibilityRole = (role) =>
  Boolean(role) && RESPONSIBILITY_ROLES.includes(role);

export const canAssignAnotherResponsibilityRole = (currentRole, nextRole) => {
  if (!nextRole || !isResponsibilityRole(nextRole)) return true;
  if (!currentRole || !isResponsibilityRole(currentRole)) return true;
  return currentRole === nextRole;
};

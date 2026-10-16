import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLES } from "../shared/constants/roles.js";
import { eventService } from "../modules/events/event.service.js";
import { Followup } from "../modules/followups/followup.model.js";

const ADMIN_ROLES = [
  ROLES.CENTRAL_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.CHAPTER_ADMIN,
  ROLES.COUNTRY_ADMIN,
  ROLES.SECRETARIAT,
  "super_admin",
  "admin",
];

/**
 * Allows a request through if the requester is a chamber admin (central/state/chapter),
 * OR is assigned the given functional role for the event in req.params.id,
 * OR has the direct functional user role (e.g. guest_speaker_manager).
 * @param {string} functionalRole - one of event.service.js's FUNCTIONAL_ROLES
 */
export const requireEventRoleOrAdmin = (...functionalRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    const userRole = req.user.role;
    if (ADMIN_ROLES.includes(userRole)) {
      return next();
    }

    const rolesToCheck = functionalRoles.flat();
    if (rolesToCheck.length === 0) {
      return next();
    }

    // Direct role match: e.g. guest_speaker_manager / guestManager / event_coordinator / eventCoordinator
    if (
      (rolesToCheck.includes("guestManager") || rolesToCheck.includes("guest_speaker_manager")) &&
      (userRole === "guest_speaker_manager" || userRole === "guestManager")
    ) {
      return next();
    }
    if (
      (rolesToCheck.includes("eventCoordinator") || rolesToCheck.includes("event_coordinator")) &&
      (userRole === "event_coordinator" || userRole === "eventCoordinator")
    ) {
      return next();
    }

    const userId = req.user.id || req.user._id;
    const eventId = req.params.id || req.params.eventId;
    if (eventId) {
      for (const role of rolesToCheck) {
        const allowed = await eventService.hasEventRole(userId, eventId, role);
        if (allowed) {
          return next();
        }
      }

      // Check chapter scope for guest managers and event coordinators
      const isGuestMgrReq = rolesToCheck.includes("guestManager") || rolesToCheck.includes("guest_speaker_manager");
      const isEventCoordReq = rolesToCheck.includes("eventCoordinator") || rolesToCheck.includes("event_coordinator");
      const isGuestMgrUser = userRole === "guest_speaker_manager" || userRole === "guestManager";
      const isEventCoordUser = userRole === "event_coordinator" || userRole === "eventCoordinator";

      if ((isGuestMgrReq && isGuestMgrUser) || (isEventCoordReq && isEventCoordUser) || ((isGuestMgrReq || isEventCoordReq) && req.user.chapter)) {
        const { Event } = await import("../modules/events/event.model.js");
        const ev = await Event.findById(eventId).select("chapter creatorChapter").lean();
        if (
          ev &&
          (!req.user.chapter ||
            ev.chapter === req.user.chapter ||
            ev.creatorChapter === req.user.chapter ||
            ev.chapter === "Global" ||
            ev.chapter?.toLowerCase().includes("all chapters"))
        ) {
          return next();
        }
      }
    }
    return next(
      new ForbiddenError(`Access denied. Requires one of [${rolesToCheck.join(", ")}] assignment for this event.`)
    );
  };
};

/**
 * Same as requireEventRoleOrAdmin, but the event id is read from the request body/query
 * (for routes like /followups that aren't nested under /events/:id).
 * @param {string} functionalRole
 */
export const requireEventRoleOrAdminByBodyEvent = (functionalRole) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }
    const userId = req.user.id || req.user._id;
    const eventId = req.body?.eventId || req.query?.eventId;
    const allowed = eventId ? await eventService.hasEventRole(userId, eventId, functionalRole) : false;
    if (!allowed) {
      return next(new ForbiddenError(`Access denied. Requires ${functionalRole} assignment for this event.`));
    }
    next();
  };
};

/**
 * Same idea, for routes that operate on an existing followup record by :id (status/note/
 * message/history) — resolves the record's own `event` field to check the assignment.
 * @param {string} functionalRole
 */
export const requireEventRoleOrAdminByFollowupId = (functionalRole) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }
    const followup = await Followup.findById(req.params.id).select("event");
    if (!followup?.event) {
      return next(new ForbiddenError("Access denied."));
    }
    const userId = req.user.id || req.user._id;
    const allowed = await eventService.hasEventRole(userId, followup.event, functionalRole);
    if (!allowed) {
      return next(new ForbiddenError(`Access denied. Requires ${functionalRole} assignment for this event.`));
    }
    next();
  };
};

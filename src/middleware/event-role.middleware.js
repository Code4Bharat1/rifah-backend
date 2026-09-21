import { ForbiddenError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLES } from "../shared/constants/roles.js";
import { eventService } from "../modules/events/event.service.js";
import { Followup } from "../modules/followups/followup.model.js";

const ADMIN_ROLES = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];

/**
 * Allows a request through if the requester is a chamber admin (central/state/chapter),
 * OR is assigned the given functional role for the event in req.params.id.
 * @param {string} functionalRole - one of event.service.js's FUNCTIONAL_ROLES
 */
export const requireEventRoleOrAdmin = (functionalRole) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (ADMIN_ROLES.includes(req.user.role)) {
      return next();
    }
    const userId = req.user.id || req.user._id;
    const eventId = req.params.id || req.params.eventId;
    const allowed = await eventService.hasEventRole(userId, eventId, functionalRole);
    if (!allowed) {
      return next(new ForbiddenError(`Access denied. Requires ${functionalRole} assignment for this event.`));
    }
    next();
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

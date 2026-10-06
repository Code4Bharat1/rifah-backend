import { ForbiddenError, NotFoundError, UnauthorizedError } from "../shared/errors/errors.js";
import { ROLES } from "../shared/constants/roles.js";
import { getChapterFilter } from "../shared/utils/chapter-scope.js";
import { Followup } from "../modules/followups/followup.model.js";
import { Event } from "../modules/events/event.model.js";
import { Chapter } from "../modules/chapters/chapter.model.js";

const ADMIN_ROLES = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];
const stripChapter = (n = "") => n.replace(/\s*[Cc]hapter\s*/g, "").trim().toLowerCase();

/**
 * For chamber admins, the followup in :id must fall in their chapter/state scope. Non-admin
 * callers (event-assigned coordinators) are left to the event-role middleware that runs first.
 */
export const requireFollowupInScope = async (req, res, next) => {
  try {
    if (!req.user) return next(new UnauthorizedError("Authentication required"));
    if (!ADMIN_ROLES.includes(req.user.role) || req.user.role === ROLES.CENTRAL_ADMIN) return next();
    const scope = await getChapterFilter(req.user, "direct");
    const found = await Followup.exists({ _id: req.params.id, ...scope });
    if (!found) return next(new NotFoundError("Followup record not found"));
    next();
  } catch (err) {
    next(err);
  }
};

/** Event referenced by :eventId must be inside the admin's scope (central admin: any). */
export const requireEventInScope = async (req, res, next) => {
  try {
    if (req.user.role === ROLES.CENTRAL_ADMIN) return next();
    const scope = await getChapterFilter(req.user, "direct");
    const found = await Event.exists({ _id: req.params.eventId, ...scope });
    if (!found) return next(new NotFoundError("Event not found"));
    next();
  } catch (err) {
    next(err);
  }
};

/** Chapter named in body.chapter must be the admin's own (chapter admin) or inside their state. */
export const requireChapterInScope = async (req, res, next) => {
  try {
    const { role, chapter: ownChapter, state } = req.user;
    if (role === ROLES.CENTRAL_ADMIN) return next();
    const requested = req.body?.chapter;
    if (!requested) return next(); // controller defaults to the caller's own chapter
    if (role === ROLES.CHAPTER_ADMIN) {
      if (stripChapter(requested) !== stripChapter(ownChapter)) {
        return next(new ForbiddenError("You can only manage your own chapter"));
      }
      return next();
    }
    if (role === ROLES.STATE_ADMIN) {
      const inState = await Chapter.find({ state: new RegExp(`^${(state || "").trim()}$`, "i") }).select("name");
      if (!inState.some((c) => stripChapter(c.name) === stripChapter(requested))) {
        return next(new ForbiddenError("Chapter is outside your state"));
      }
      return next();
    }
    next(new ForbiddenError("Access denied"));
  } catch (err) {
    next(err);
  }
};

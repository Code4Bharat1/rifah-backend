import { EventMedia } from "./gallery.model.js";
import { Event } from "../events/event.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { ROLES } from "../../shared/constants/roles.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../shared/errors/errors.js";

const ADMIN_ROLES = [ROLES.CENTRAL_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];

const UNSET_STATES = ["", "unassigned", "all", "none"];

/**
 * Most member accounts carry no usable `state` of their own (it is left blank or
 * "Unassigned" at registration) — their chapter is the reliable signal. Resolve the state
 * a viewer belongs to from their chapter whenever their own field is not meaningful,
 * otherwise a state-scoped gallery would be invisible to nearly everyone.
 */
const resolveViewerState = async (user) => {
  const own = String(user?.state || "").trim();
  if (own && !UNSET_STATES.includes(own.toLowerCase())) return own;
  if (!user?.chapter) return "";
  const chapter = await Chapter.findOne({ name: user.chapter }).select("state").lean();
  const fromChapter = String(chapter?.state || "").trim();
  return fromChapter && !UNSET_STATES.includes(fromChapter.toLowerCase()) ? fromChapter : "";
};

/**
 * Who may SEE an event's gallery folder:
 *   global  (central event) -> everyone
 *   state   (state event)   -> members of that state
 *   chapter (chapter event) -> members of that chapter
 * Central admin sees everything; a state admin sees everything inside their state.
 *
 * Expressed as a match against Event documents (creatorState / chapter / visibilityScope).
 */
const buildEventScopeMatch = (user, viewerState) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return null;

  if (user.role === ROLES.STATE_ADMIN) {
    return { $or: [{ visibilityScope: "global" }, { creatorState: viewerState }] };
  }

  return {
    $or: [
      { visibilityScope: "global" },
      { visibilityScope: "state", creatorState: viewerState },
      { visibilityScope: "chapter", chapter: user.chapter || "" },
    ],
  };
};

/** The same rule, applied to a single already-loaded event. */
const canViewEvent = (event, user, viewerState) => {
  if (!event) return false;
  const scope = event.visibilityScope || "global";
  if (!user) return scope === "global";
  if (user.role === ROLES.CENTRAL_ADMIN) return true;
  if (scope === "global") return true;
  const eventState = event.creatorState || "";
  if (user.role === ROLES.STATE_ADMIN) return Boolean(viewerState) && eventState === viewerState;
  if (scope === "state") return Boolean(viewerState) && eventState === viewerState;
  return Boolean(user.chapter) && (event.chapter || "") === user.chapter;
};

/** Only the assigned media-team member (or a chamber admin) may add to a folder. */
const canUploadToEvent = (event, user) => {
  if (!user) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  const userId = String(user.id || user._id);
  return (event.roleAssignments || []).some(
    (a) => a.role === "photosVideo" && String(a.user) === userId
  );
};

export const eventMediaService = {
  countForEvent: (eventId) => EventMedia.countDocuments({ event: eventId }),

  canUploadToEvent,

  /**
   * The gallery index: one folder per event, with its details and a cover thumbnail.
   * Folders with no media are still returned when the requester is the one who would
   * fill them (media team or admin), so they have somewhere to upload.
   */
  async listFolders(query = {}, user) {
    const { q, from, to, state, chapter, scope } = query;
    const { page, limit, skip } = parsePagination(query);

    const filters = {};
    if (q) filters.title = { $regex: String(q).trim(), $options: "i" };
    if (state && state !== "All") filters.creatorState = state;
    if (chapter && chapter !== "All") filters.chapter = chapter;
    if (scope && String(scope).toLowerCase() !== "all") {
      // "central" is the user-facing name for a globally-visible event
      filters.visibilityScope = String(scope).toLowerCase() === "central" ? "global" : scope;
    }
    if (from || to) {
      filters.date = {};
      if (from) filters.date.$gte = String(from);
      // event.date is sometimes a full ISO timestamp, so widen the upper bound to
      // cover every time-of-day on the end date.
      if (to) filters.date.$lte = String(to) + "￿";
    }

    const viewerState = await resolveViewerState(user);
    const scopeMatch = buildEventScopeMatch(user, viewerState);
    const finalMatch = scopeMatch ? { $and: [filters, scopeMatch] } : filters;

    const events = await Event.find(finalMatch)
      .select("title date time venue chapter creatorState visibilityScope status coverImage posterImage roleAssignments")
      .sort({ date: -1 })
      .lean();

    const eventIds = events.map((e) => e._id);
    const counts = await EventMedia.aggregate([
      { $match: { event: { $in: eventIds } } },
      {
        $group: {
          _id: "$event",
          total: { $sum: 1 },
          photos: { $sum: { $cond: [{ $eq: ["$type", "image"] }, 1, 0] } },
          videos: { $sum: { $cond: [{ $eq: ["$type", "video"] }, 1, 0] } },
          cover: { $first: "$url" },
          lastAddedAt: { $max: "$createdAt" },
        },
      },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c]));

    const folders = events
      .map((e) => {
        const stat = countMap.get(String(e._id)) || {
          total: 0,
          photos: 0,
          videos: 0,
          cover: "",
          lastAddedAt: null,
        };
        return {
          eventId: e._id,
          title: e.title,
          date: e.date,
          time: e.time,
          venue: e.venue,
          chapter: e.chapter,
          state: e.creatorState || "",
          scope: e.visibilityScope || "global",
          status: e.status,
          coverImage: stat.cover || e.coverImage || e.posterImage || "",
          photoCount: stat.photos,
          videoCount: stat.videos,
          mediaCount: stat.total,
          lastAddedAt: stat.lastAddedAt,
          canUpload: canUploadToEvent(e, user),
        };
      })
      // An empty folder is only useful to whoever can fill it.
      .filter((f) => f.mediaCount > 0 || f.canUpload);

    const total = folders.length;
    return {
      folders: folders.slice(skip, skip + limit),
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /** Everything inside one event's folder. */
  async getFolder(eventId, user) {
    const event = await Event.findById(eventId)
      .select("title date time venue chapter creatorState visibilityScope status coverImage posterImage roleAssignments summary")
      .lean();
    if (!event) throw new NotFoundError("Event not found");
    const viewerState = await resolveViewerState(user);
    if (!canViewEvent(event, user, viewerState)) {
      throw new ForbiddenError("This event gallery is not shared with your chapter.");
    }

    const media = await EventMedia.find({ event: eventId })
      .populate("uploadedBy", "name avatar")
      .sort({ createdAt: -1 })
      .lean();

    return {
      event: {
        eventId: event._id,
        title: event.title,
        date: event.date,
        time: event.time,
        venue: event.venue,
        summary: event.summary || "",
        chapter: event.chapter,
        state: event.creatorState || "",
        scope: event.visibilityScope || "global",
        status: event.status,
        coverImage: event.coverImage || event.posterImage || "",
      },
      canUpload: canUploadToEvent(event, user),
      media,
    };
  },

  /** Media team (or an admin) adds photos/videos to an event folder. */
  async addMedia(eventId, files, { caption = "" } = {}, user) {
    if (!files || files.length === 0) throw new BadRequestError("No files uploaded");

    const event = await Event.findById(eventId)
      .select("chapter creatorState visibilityScope date roleAssignments")
      .lean();
    if (!event) throw new NotFoundError("Event not found");

    if (!canUploadToEvent(event, user)) {
      throw new ForbiddenError("Only the event's assigned media team can add to this gallery.");
    }

    const created = [];
    for (const file of files) {
      const mime = (file.mimetype || "").toLowerCase();
      if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
        throw new BadRequestError(`'${file.originalname}' is not a photo or a video.`);
      }
      const url = await storageService.uploadFile(file, "gallery");
      const doc = await EventMedia.create({
        event: eventId,
        type: mime.startsWith("video/") ? "video" : "image",
        url,
        caption: String(caption || "").trim(),
        mimetype: mime,
        size: file.size || 0,
        uploadedBy: user.id || user._id,
        chapter: event.chapter || "",
        state: event.creatorState || "",
        visibilityScope: event.visibilityScope || "global",
        eventDate: event.date || "",
      });
      created.push(doc);
    }

    return created;
  },

  /** An uploader may remove their own media; admins may remove any. */
  async removeMedia(mediaId, user) {
    const media = await EventMedia.findById(mediaId);
    if (!media) throw new NotFoundError("Media not found");

    const isAdmin = ADMIN_ROLES.includes(user.role);
    const isOwner = String(media.uploadedBy) === String(user.id || user._id);
    if (!isAdmin && !isOwner) {
      throw new ForbiddenError("You can only remove media you uploaded.");
    }

    await media.deleteOne();
    return { _id: mediaId };
  },
};

export default eventMediaService;

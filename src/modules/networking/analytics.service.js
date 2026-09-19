import { ThankYouNote } from "./thank-you-note.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";

const stateRegex = (state) => new RegExp(`^${state.trim()}$`, "i");

/** Documents where the GIVER (business that generated business for someone) is within the admin's scope */
const giverScopeMatch = (user) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) return user.state ? { giverState: stateRegex(user.state) } : { _id: null };
  if (user.role === ROLES.CHAPTER_ADMIN) return user.chapterId ? { giverChapterId: user.chapterId } : { _id: null };
  return { _id: null };
};

/** Documents where the RECEIVER (business that received business) is within the admin's scope */
const receiverScopeMatch = (user) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) return user.state ? { receiverState: stateRegex(user.state) } : { _id: null };
  if (user.role === ROLES.CHAPTER_ADMIN) return user.chapterId ? { receiverChapterId: user.chapterId } : { _id: null };
  return { _id: null };
};

/** Documents touching the admin's scope at all (either party) — counted once, no double-count */
const eitherScopeMatch = (user) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return {};
  if (user.role === ROLES.STATE_ADMIN) {
    if (!user.state) return { _id: null };
    const re = stateRegex(user.state);
    return { $or: [{ giverState: re }, { receiverState: re }] };
  }
  if (user.role === ROLES.CHAPTER_ADMIN) {
    if (!user.chapterId) return { _id: null };
    return { $or: [{ giverChapterId: user.chapterId }, { receiverChapterId: user.chapterId }] };
  }
  return { _id: null };
};

const sumAmount = async (match) => {
  const rows = await ThankYouNote.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: rows[0]?.total || 0, count: rows[0]?.count || 0 };
};

const scopeLabel = (user) => {
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return { level: "central", name: "All India" };
  if (user.role === ROLES.STATE_ADMIN) return { level: "state", name: user.state || "" };
  if (user.role === ROLES.CHAPTER_ADMIN) return { level: "chapter", name: "" };
  return { level: "none", name: "" };
};

export const analyticsService = {
  /**
   * Scoped headline numbers: central admin sees national totals, a state
   * admin sees their state's totals, a chapter admin sees their chapter's.
   */
  overview: async (user) => {
    const [given, received, volume, bySourceRows] = await Promise.all([
      sumAmount(giverScopeMatch(user)),
      sumAmount(receiverScopeMatch(user)),
      sumAmount(eitherScopeMatch(user)),
      ThankYouNote.aggregate([
        { $match: eitherScopeMatch(user) },
        { $group: { _id: "$source", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const bySource = { direct: { total: 0, count: 0 }, referral: { total: 0, count: 0 } };
    bySourceRows.forEach((r) => {
      if (bySource[r._id]) bySource[r._id] = { total: r.total, count: r.count };
    });

    let label = scopeLabel(user);
    if (label.level === "chapter" && user.chapterId) {
      const chapter = await Chapter.findById(user.chapterId).select("name state");
      label = { level: "chapter", name: chapter?.name || "", state: chapter?.state || "" };
    }

    return {
      scope: label,
      totalGiven: given.total,
      givenCount: given.count,
      totalReceived: received.total,
      receivedCount: received.count,
      totalVolume: volume.total,
      transactionCount: volume.count,
      bySource,
    };
  },

  /**
   * Top businesses by business given or received, scoped to the admin's level.
   */
  leaderboard: async (user, { type = "given", limit = 10 } = {}) => {
    const cleanType = type === "received" ? "received" : "given";
    const match = cleanType === "given" ? giverScopeMatch(user) : receiverScopeMatch(user);
    const groupField = cleanType === "given" ? "$giverBusiness" : "$receiverBusiness";
    const cappedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

    const rows = await ThankYouNote.aggregate([
      { $match: match },
      { $group: { _id: groupField, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: cappedLimit },
      {
        $lookup: {
          from: "businesses",
          localField: "_id",
          foreignField: "_id",
          as: "business",
        },
      },
      { $unwind: "$business" },
      {
        $lookup: {
          from: "chapters",
          localField: "business.chapterId",
          foreignField: "_id",
          as: "chapter",
        },
      },
      { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          businessId: "$_id",
          businessName: "$business.name",
          logo: "$business.logo",
          state: "$business.state",
          chapterName: "$chapter.name",
          total: 1,
          count: 1,
        },
      },
    ]);

    return { type: cleanType, rows };
  },

  /**
   * Central admin can drill into state or chapter numbers; a state admin can
   * drill into the chapters within their own state. Chapter admins have
   * nothing further to drill into (their scope is already the smallest).
   */
  breakdown: async (user, { level } = {}) => {
    if (level === "state") {
      if (!user || user.role !== ROLES.CENTRAL_ADMIN) {
        throw new ForbiddenError("Only central admin can view state-wise breakdown");
      }
      const [givenRows, receivedRows] = await Promise.all([
        ThankYouNote.aggregate([
          { $group: { _id: "$giverState", given: { $sum: "$amount" }, givenCount: { $sum: 1 } } },
        ]),
        ThankYouNote.aggregate([
          { $group: { _id: "$receiverState", received: { $sum: "$amount" }, receivedCount: { $sum: 1 } } },
        ]),
      ]);

      const map = new Map();
      givenRows.forEach((r) => {
        map.set(r._id, { label: r._id, given: r.given, givenCount: r.givenCount, received: 0, receivedCount: 0 });
      });
      receivedRows.forEach((r) => {
        const existing = map.get(r._id);
        if (existing) {
          existing.received = r.received;
          existing.receivedCount = r.receivedCount;
        } else {
          map.set(r._id, { label: r._id, given: 0, givenCount: 0, received: r.received, receivedCount: r.receivedCount });
        }
      });

      return { level: "state", rows: Array.from(map.values()).sort((a, b) => b.given + b.received - (a.given + a.received)) };
    }

    if (level === "chapter") {
      let giverMatch = {};
      let receiverMatch = {};

      if (user && user.role === ROLES.STATE_ADMIN) {
        if (!user.state) throw new ForbiddenError("No state assigned");
        const re = stateRegex(user.state);
        giverMatch = { giverState: re };
        receiverMatch = { receiverState: re };
      } else if (!user || user.role !== ROLES.CENTRAL_ADMIN) {
        throw new ForbiddenError("Only central or state admin can view chapter-wise breakdown");
      }

      const [givenRows, receivedRows] = await Promise.all([
        ThankYouNote.aggregate([
          { $match: giverMatch },
          { $group: { _id: "$giverChapterId", given: { $sum: "$amount" }, givenCount: { $sum: 1 } } },
        ]),
        ThankYouNote.aggregate([
          { $match: receiverMatch },
          { $group: { _id: "$receiverChapterId", received: { $sum: "$amount" }, receivedCount: { $sum: 1 } } },
        ]),
      ]);

      const map = new Map();
      givenRows.forEach((r) => {
        map.set(String(r._id), { chapterId: r._id, given: r.given, givenCount: r.givenCount, received: 0, receivedCount: 0 });
      });
      receivedRows.forEach((r) => {
        const key = String(r._id);
        const existing = map.get(key);
        if (existing) {
          existing.received = r.received;
          existing.receivedCount = r.receivedCount;
        } else {
          map.set(key, { chapterId: r._id, given: 0, givenCount: 0, received: r.received, receivedCount: r.receivedCount });
        }
      });

      const chapterIds = Array.from(map.keys());
      const chapters = await Chapter.find({ _id: { $in: chapterIds } }).select("name state");
      const chapterById = new Map(chapters.map((c) => [String(c._id), c]));

      const rows = Array.from(map.values())
        .map((r) => ({
          ...r,
          label: chapterById.get(String(r.chapterId))?.name || "Unknown chapter",
          state: chapterById.get(String(r.chapterId))?.state || "",
        }))
        .sort((a, b) => b.given + b.received - (a.given + a.received));

      return { level: "chapter", rows };
    }

    throw new BadRequestError("Please specify a valid breakdown level (state or chapter)");
  },

  /**
   * Public, unauthenticated state-wise "business generated" totals for the
   * landing page — encourages new members by showing network activity.
   */
  publicStateTotals: async () => {
    const rows = await ThankYouNote.aggregate([
      { $group: { _id: "$giverState", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    return rows.map((r) => ({ state: r._id, totalBusinessGenerated: r.total, transactionCount: r.count }));
  },
};

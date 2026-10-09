
import mongoose from "mongoose";
import { ThankYouNote } from "./thank-you-note.model.js";
import { Referral } from "./referral.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";
import { formatStateName, resolveStateFromCity, resolveOwnBusiness } from "./networking.utils.js";

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
  if (!user || user.role === ROLES.CENTRAL_ADMIN) return { level: "central", name: "Central" };
  if (user.role === ROLES.STATE_ADMIN) return { level: "state", name: user.state || "" };
  if (user.role === ROLES.CHAPTER_ADMIN) return { level: "chapter", name: "" };
  return { level: "none", name: "" };
};

/** Auto-repairs missing/unassigned states on existing ThankYouNotes */
const repairThankYouNoteStates = async () => {
  try {
    const brokenNotes = await ThankYouNote.find({
      $or: [
        { giverState: { $in: ["Unassigned", "unassigned", "", null] } },
        { giverState: { $exists: false } },
        { receiverState: { $in: ["Unassigned", "unassigned", "", null] } },
        { receiverState: { $exists: false } },
      ],
    })
      .populate("giverBusiness", "name city state chapterId owner")
      .populate("receiverBusiness", "name city state chapterId owner")
      .populate("giverChapterId", "name state")
      .populate("receiverChapterId", "name state")
      .limit(100);

    for (const note of brokenNotes) {
      let resolvedGiverState = formatStateName(note.giverState);
      if (!resolvedGiverState) {
        if (note.giverChapterId?.state) {
          resolvedGiverState = formatStateName(note.giverChapterId.state);
        }
        if (!resolvedGiverState && note.giverBusiness?.state) {
          resolvedGiverState = formatStateName(note.giverBusiness.state);
        }
        if (!resolvedGiverState && note.giverBusiness?.city) {
          resolvedGiverState = formatStateName(await resolveStateFromCity(note.giverBusiness.city));
        }
        if (!resolvedGiverState && note.receiverChapterId?.state) {
          resolvedGiverState = formatStateName(note.receiverChapterId.state);
        }
        if (!resolvedGiverState && note.receiverBusiness?.state) {
          resolvedGiverState = formatStateName(note.receiverBusiness.state);
        }
        if (!resolvedGiverState && note.receiverBusiness?.city) {
          resolvedGiverState = formatStateName(await resolveStateFromCity(note.receiverBusiness.city));
        }
      }

      let resolvedReceiverState = formatStateName(note.receiverState) || resolvedGiverState;
      if (!resolvedReceiverState && note.receiverChapterId?.state) {
        resolvedReceiverState = formatStateName(note.receiverChapterId.state);
      }

      let modified = false;
      if (resolvedGiverState && note.giverState !== resolvedGiverState) {
        note.giverState = resolvedGiverState;
        modified = true;
      }
      if (resolvedReceiverState && note.receiverState !== resolvedReceiverState) {
        note.receiverState = resolvedReceiverState;
        modified = true;
      }
      if (modified) {
        await note.save().catch(() => {});
      }
    }
  } catch (err) {
    // Non-blocking
  }
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
        const cleanState = formatStateName(r._id);
        if (!cleanState) return;
        const existing = map.get(cleanState) || { label: cleanState, given: 0, givenCount: 0, received: 0, receivedCount: 0 };
        existing.given += r.given;
        existing.givenCount += r.givenCount;
        map.set(cleanState, existing);
      });
      receivedRows.forEach((r) => {
        const cleanState = formatStateName(r._id);
        if (!cleanState) return;
        const existing = map.get(cleanState) || { label: cleanState, given: 0, givenCount: 0, received: 0, receivedCount: 0 };
        existing.received += r.received;
        existing.receivedCount += r.receivedCount;
        map.set(cleanState, existing);
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

      const chapterIds = Array.from(map.keys()).filter((id) => id && id !== "null" && id !== "undefined");
      const chapters = await Chapter.find({ _id: { $in: chapterIds } }).select("name state");
      const chapterById = new Map(chapters.map((c) => [String(c._id), c]));

      // Group rows by resolved chapter name / label so multiple unknown or deleted chapters are aggregated into a single entry
      const consolidated = new Map();
      Array.from(map.values()).forEach((r) => {
        const chapter = chapterById.get(String(r.chapterId));
        const label = chapter?.name || "Unassigned / Other";
        const state = chapter?.state || "";
        const existing = consolidated.get(label) || {
          chapterId: chapter?._id || r.chapterId || "unassigned",
          label,
          state,
          given: 0,
          givenCount: 0,
          received: 0,
          receivedCount: 0,
        };
        existing.given += r.given;
        existing.givenCount += r.givenCount;
        existing.received += r.received;
        existing.receivedCount += r.receivedCount;
        consolidated.set(label, existing);
      });

      const rows = Array.from(consolidated.values())
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
    // 1. Auto-repair missing / unassigned states on existing notes
    await repairThankYouNoteStates();

    // 2. Aggregate and normalize by clean Title Case state
    const allNotes = await ThankYouNote.find({ amount: { $gt: 0 } }).select("giverState amount");
    const map = new Map();

    allNotes.forEach((note) => {
      const clean = formatStateName(note.giverState);
      if (!clean || clean.toLowerCase() === "unassigned") return;

      const existing = map.get(clean) || { total: 0, count: 0 };
      existing.total += Number(note.amount) || 0;
      existing.count += 1;
      map.set(clean, existing);
    });

    const rows = Array.from(map.entries())
      .map(([state, data]) => ({
        state,
        totalBusinessGenerated: data.total,
        transactionCount: data.count,
      }))
      .sort((a, b) => b.totalBusinessGenerated - a.totalBusinessGenerated);

    return rows;
  },

  /**
   * Spotlight Leaderboard: Top #1 Referral Champion & Top #1 Business Generator
   * Scoped hierarchically (Chapter -> State -> National) with customizable period
   * (this_month, last_month, all_time), tie-breaker rules, and calling user's rank status.
   */
  getSpotlightLeaderboard: async (user, query = {}) => {
    const userRole = user?.role;
    const isCentral = [ROLES.CENTRAL_ADMIN, ROLES.SECRETARIAT, "super_admin", "admin"].includes(userRole);
    const isState = userRole === ROLES.STATE_ADMIN;

    let scope = (query.scope || "").toLowerCase();
    if (!["chapter", "state", "national"].includes(scope)) {
      if (isCentral) scope = "national";
      else if (isState) scope = "state";
      else scope = "chapter";
    }

    let period = (query.period || "this_month").toLowerCase();
    if (!["this_month", "last_month", "all_time"].includes(period)) {
      period = "this_month";
    }

    let dateMatch = {};
    const now = new Date();
    if (period === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateMatch = { createdAt: { $gte: startOfMonth } };
    } else if (period === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      dateMatch = { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } };
    }

    const userId = user?._id || user?.id;
    let myBusiness = null;
    if (userId) {
      myBusiness = await resolveOwnBusiness(userId).catch(() => null);
    }
    const myBusinessId = myBusiness?._id || user?.businessId || query?.businessId || null;
    const myBizIdStr = myBusinessId ? myBusinessId.toString() : "";

    let referralScopeMatch = {};
    let tynScopeMatch = {};
    let scopeInfo = { level: scope, name: "Central", state: "", chapterId: null };

    if (scope === "chapter") {
      let targetChapterId = query.chapterId || user?.chapterId || myBusiness?.chapterId;
      if (targetChapterId && mongoose.isValidObjectId(targetChapterId)) {
        targetChapterId = new mongoose.Types.ObjectId(targetChapterId);
        referralScopeMatch = { referrerChapterId: targetChapterId };
        tynScopeMatch = {
          $or: [
            { giverChapterId: targetChapterId },
            { receiverChapterId: targetChapterId },
          ],
        };
        const ch = await Chapter.findById(targetChapterId).select("name state").lean();
        if (ch) {
          scopeInfo.name = ch.name;
          scopeInfo.state = ch.state || "";
          scopeInfo.chapterId = ch._id.toString();
        }
      } else {
        referralScopeMatch = { _id: null };
        tynScopeMatch = { _id: null };
        scopeInfo.name = "My Chapter";
      }
    } else if (scope === "state") {
      let targetState = query.state || user?.state || myBusiness?.state || "";
      targetState = formatStateName(targetState);
      if (targetState) {
        const re = stateRegex(targetState);
        referralScopeMatch = { referrerState: re };
        tynScopeMatch = {
          $or: [
            { giverState: re },
            { receiverState: re },
          ],
        };
        scopeInfo.name = targetState;
        scopeInfo.state = targetState;
      } else {
        referralScopeMatch = { _id: null };
        tynScopeMatch = { _id: null };
        scopeInfo.name = "My State";
      }
    } else {
      referralScopeMatch = {};
      tynScopeMatch = {};
      scopeInfo.name = "Central";
      scopeInfo.level = "national";
    }

    const referralMatch = { ...referralScopeMatch, ...dateMatch };
    const referralPipeline = [
      { $match: referralMatch },
      {
        $group: {
          _id: "$referrerBusiness",
          count: { $sum: 1 },
          firstActivityAt: { $min: "$createdAt" },
          lastActivityAt: { $max: "$createdAt" },
        },
      },
      { $sort: { count: -1, firstActivityAt: 1 } },
      {
        $facet: {
          topList: [
            { $limit: 1 },
            {
              $lookup: {
                from: "businesses",
                localField: "_id",
                foreignField: "_id",
                as: "biz",
              },
            },
            { $unwind: "$biz" },
            {
              $lookup: {
                from: "chapters",
                localField: "biz.chapterId",
                foreignField: "_id",
                as: "ch",
              },
            },
            { $unwind: { path: "$ch", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                businessId: "$_id",
                businessName: "$biz.name",
                slug: "$biz.slug",
                logo: "$biz.logo",
                contactPerson: "$biz.contactPerson",
                phone: "$biz.phone",
                whatsapp: { $ifNull: ["$biz.whatsapp", "$biz.whatsappNumber"] },
                state: "$biz.state",
                chapterName: { $ifNull: ["$ch.name", "$biz.chapter"] },
                score: "$count",
                firstActivityAt: 1,
                lastActivityAt: 1,
              },
            },
          ],
          allRankings: [
            {
              $project: {
                _id: 0,
                businessId: "$_id",
                count: "$count",
              },
            },
          ],
          totalStats: [
            {
              $group: {
                _id: null,
                totalReferrals: { $sum: "$count" },
              },
            },
          ],
        },
      },
    ];

    const tynMatch = { ...tynScopeMatch, ...dateMatch };
    const tynPipeline = [
      { $match: tynMatch },
      {
        $facet: {
          totalStats: [
            {
              $group: {
                _id: null,
                totalBusiness: { $sum: "$amount" },
                totalNotes: { $sum: 1 },
              },
            },
          ],
          allRankingsRaw: [
            {
              $project: {
                amount: "$amount",
                createdAt: "$createdAt",
                businesses: ["$giverBusiness", "$receiverBusiness"],
              },
            },
            { $unwind: "$businesses" },
            { $match: { businesses: { $ne: null } } },
            {
              $group: {
                _id: "$businesses",
                totalAmount: { $sum: "$amount" },
                count: { $sum: 1 },
                firstActivityAt: { $min: "$createdAt" },
                lastActivityAt: { $max: "$createdAt" },
              },
            },
            { $sort: { totalAmount: -1, firstActivityAt: 1 } },
            {
              $lookup: {
                from: "businesses",
                localField: "_id",
                foreignField: "_id",
                as: "biz",
              },
            },
            { $unwind: "$biz" },
            {
              $lookup: {
                from: "chapters",
                localField: "biz.chapterId",
                foreignField: "_id",
                as: "ch",
              },
            },
            { $unwind: { path: "$ch", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                businessId: "$_id",
                businessName: "$biz.name",
                slug: "$biz.slug",
                logo: "$biz.logo",
                contactPerson: "$biz.contactPerson",
                phone: "$biz.phone",
                whatsapp: { $ifNull: ["$biz.whatsapp", "$biz.whatsappNumber"] },
                state: "$biz.state",
                chapterName: { $ifNull: ["$ch.name", "$biz.chapter"] },
                totalAmount: "$totalAmount",
                noteCount: "$count",
                firstActivityAt: 1,
                lastActivityAt: 1,
              },
            },
          ],
        },
      },
    ];

    const [refResults, tynResults] = await Promise.all([
      Referral.aggregate(referralPipeline),
      ThankYouNote.aggregate(tynPipeline),
    ]);

    const refTop1 = refResults[0]?.topList?.[0] || null;
    const refAll = refResults[0]?.allRankings || [];
    const refTotal = refResults[0]?.totalStats?.[0]?.totalReferrals || 0;

    let myRefStatus = {
      isChampion: false,
      rank: null,
      score: 0,
      gapToTop: refTop1 ? refTop1.score : 0,
    };

    if (myBizIdStr) {
      if (refTop1 && refTop1.businessId?.toString() === myBizIdStr) {
        myRefStatus = {
          isChampion: true,
          rank: 1,
          score: refTop1.score || 0,
          gapToTop: 0,
        };
      } else if (refAll.length > 0) {
        const myIndex = refAll.findIndex(
          (item) => item.businessId?.toString() === myBizIdStr
        );
        if (myIndex !== -1) {
          const rank = myIndex + 1;
          const score = refAll[myIndex].count || 0;
          const rawGap = Math.max(0, (refTop1?.score || 0) - score);
          myRefStatus = {
            isChampion: rank === 1,
            rank,
            score,
            gapToTop: rawGap === 0 && rank > 1 ? 1 : rawGap,
          };
        }
      }
    }

    const tynAll = tynResults[0]?.allRankingsRaw || [];
    const tynTop1 = tynAll[0] || null;
    const tynTotalAmount = tynResults[0]?.totalStats?.[0]?.totalBusiness || 0;
    const tynTotalNotes = tynResults[0]?.totalStats?.[0]?.totalNotes || 0;

    let myTynStatus = {
      isChampion: false,
      rank: null,
      totalAmount: 0,
      gapToTop: tynTop1 ? tynTop1.totalAmount : 0,
    };

    if (myBizIdStr) {
      if (tynTop1 && tynTop1.businessId?.toString() === myBizIdStr) {
        myTynStatus = {
          isChampion: true,
          rank: 1,
          totalAmount: tynTop1.totalAmount || 0,
          gapToTop: 0,
        };
      } else if (tynAll.length > 0) {
        const myIndex = tynAll.findIndex(
          (item) => item.businessId?.toString() === myBizIdStr
        );
        if (myIndex !== -1) {
          const rank = myIndex + 1;
          const totalAmount = tynAll[myIndex].totalAmount || 0;
          const rawGap = Math.max(0, (tynTop1?.totalAmount || 0) - totalAmount);
          myTynStatus = {
            isChampion: rank === 1,
            rank,
            totalAmount,
            gapToTop: rawGap === 0 && rank > 1 ? 1 : rawGap,
          };
        }
      }
    }

    return {
      scope: scopeInfo,
      period,
      referralChampion: {
        top1: refTop1,
        myStatus: myRefStatus,
        totalScopeActivity: refTotal,
      },
      thankYouNoteChampion: {
        top1: tynTop1,
        myStatus: myTynStatus,
        totalScopeAmount: tynTotalAmount,
        totalScopeNotes: tynTotalNotes,
      },
    };
  },
};


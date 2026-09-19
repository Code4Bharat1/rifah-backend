import { Audit } from "./audit.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { User } from "../users/user.model.js";
import { Chapter } from "../chapters/chapter.model.js";

export const auditService = {
  /**
   * Record an audit log entry
   */
  logAction: async ({ actor, action, targetModel, targetId, summary, metadata, ipAddress }) => {
    let actorName = actor.name;
    if (!actorName && (actor._id || actor.id)) {
      try {
        const u = await User.findById(actor._id || actor.id).select("name");
        if (u && u.name) actorName = u.name;
      } catch (err) {
        // Ignore DB errors on lookup
      }
    }

    return Audit.create({
      actor: actor._id || actor.id,
      actorName: actorName || "System",
      actorRole: actor.role || "system",
      action,
      targetModel,
      targetId: String(targetId),
      summary,
      metadata: metadata || {},
      ipAddress: ipAddress || "",
    });
  },

  /**
   * List audit logs (Admin only)
   */
  listAuditLogs: async (queryParams = {}, user = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = { action: { $ne: "DELETE" } };

    // 1. Scope for State Admin: only state admin and its chapter admin logs, strictly no super admin logs, no DELETE actions
    if (user && user.role === ROLES.STATE_ADMIN) {
      let stateName = user.state;
      const userId = user._id || user.id;

      if (!stateName && userId) {
        const u = await User.findById(userId).select("state");
        if (u && u.state) stateName = u.state;
      }

      if (!stateName) {
        filter._id = null;
      } else {
        const stateRegex = new RegExp(`^${stateName.trim()}$`, "i");

        // Find chapters in this state
        const stateChapters = await Chapter.find({ state: stateRegex }).select("_id");
        const chapterIds = stateChapters.map((c) => c._id);

        // Find chapter admins for those chapters
        const chapterAdmins = await User.find({
          chapterId: { $in: chapterIds },
          role: ROLES.CHAPTER_ADMIN,
        }).select("_id");
        const chapterAdminIds = chapterAdmins.map((u) => u._id);

        // Find state admins for this state
        const stateAdmins = await User.find({
          state: stateRegex,
          role: ROLES.STATE_ADMIN,
        }).select("_id");
        const stateAdminIds = stateAdmins.map((u) => u._id);

        const allowedActorIds = [...stateAdminIds, ...chapterAdminIds];
        if (userId && !allowedActorIds.some((id) => id.toString() === userId.toString())) {
          allowedActorIds.push(userId);
        }

        filter.actor = { $in: allowedActorIds };
        filter.actorRole = { $in: [ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN] };
        filter.action = { $nin: ["DELETE", "delete"] };
      }
    } else if (user && user.role === ROLES.CHAPTER_ADMIN) {
      // 2. Scope for Chapter Admin: actions in their chapter, strictly no super admin logs, no DELETE actions
      let chapterId = user.chapterId;
      const userId = user._id || user.id;

      if (!chapterId && userId) {
        const u = await User.findById(userId).select("chapterId");
        if (u && u.chapterId) chapterId = u.chapterId;
      }

      if (!chapterId) {
        filter._id = null;
      } else {
        const usersInChapter = await User.find({ chapterId }).select("_id");
        const userIds = usersInChapter.map((u) => u._id);
        if (userId && !userIds.some((id) => id.toString() === userId.toString())) {
          userIds.push(userId);
        }
        filter.actor = { $in: userIds };
        filter.actorRole = { $ne: ROLES.CENTRAL_ADMIN };
        filter.action = { $nin: ["DELETE", "delete"] };
      }
    }

    if (queryParams.action) {
      if (
        user &&
        (user.role === ROLES.STATE_ADMIN || user.role === ROLES.CHAPTER_ADMIN) &&
        queryParams.action.toUpperCase() === "DELETE"
      ) {
        filter._id = null; // Do not allow state/chapter admin to view DELETE status
      } else {
        filter.action = queryParams.action;
      }
    }

    if (queryParams.targetModel) filter.targetModel = queryParams.targetModel;
    
    if (queryParams.search) {
      const searchRegex = new RegExp(queryParams.search, "i");
      const searchOr = [
        { action: searchRegex },
        { actorName: searchRegex },
        { targetModel: searchRegex },
        { summary: searchRegex },
      ];
      if (Object.keys(filter).length > 0) {
        filter.$and = [{ $or: searchOr }];
      } else {
        filter.$or = searchOr;
      }
    }

    const [logs, total] = await Promise.all([
      Audit.find(filter).sort(sort).skip(skip).limit(limit),
      Audit.countDocuments(filter),
    ]);

    return {
      logs,
      meta: buildPaginationMeta(total, page, limit),
    };
  },
};

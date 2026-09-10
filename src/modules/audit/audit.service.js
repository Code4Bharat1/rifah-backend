import { Audit } from "./audit.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { User } from "../users/user.model.js";

export const auditService = {
  /**
   * Record an audit log entry
   */
  logAction: async ({ actor, action, targetModel, targetId, summary, metadata, ipAddress }) => {
    return Audit.create({
      actor: actor._id || actor.id,
      actorName: actor.name || "System",
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
    const filter = {};

    // Restrict chapter admins to see only actions performed by users in their chapter
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      if (!user.chapterId) {
        filter._id = null; // Deny access if they have no chapter assigned
      } else {
        const usersInChapter = await User.find({ chapterId: user.chapterId }).select("_id");
        const userIds = usersInChapter.map((u) => u._id);
        filter.actor = { $in: userIds };
      }
    }

    if (queryParams.action) filter.action = queryParams.action;
    if (queryParams.targetModel) filter.targetModel = queryParams.targetModel;
    
    if (queryParams.search) {
      const searchRegex = new RegExp(queryParams.search, "i");
      filter.$or = [
        { action: searchRegex },
        { actorName: searchRegex },
        { targetModel: searchRegex },
        { summary: searchRegex },
      ];
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

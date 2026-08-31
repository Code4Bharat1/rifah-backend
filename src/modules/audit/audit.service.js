import { Audit } from "./audit.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";

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
  listAuditLogs: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.action) filter.action = queryParams.action;
    if (queryParams.targetModel) filter.targetModel = queryParams.targetModel;

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

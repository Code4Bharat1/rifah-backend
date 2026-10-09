import { RolePermissionTemplate } from "./role-permission-template.model.js";
import { AppError } from "../../shared/errors/AppError.js";
import { auditService } from "../audit/audit.service.js";

export const LEADER_ROLES = [
  "Chairman",
  "Co-Founder",
  "President",
  "Vice President",
  "Secretary",
  "Joint Secretary",
  "Treasurer",
  "Director",
  "Executive Member",
  "Board Member",
  "Advisor",
  "Other",
];

export const rolePermissionTemplateService = {
  /**
   * List all templates visible to the requesting admin.
   * - Central admin sees everything.
   * - State admin sees state-level templates for their state.
   * - Chapter admin sees chapter-level templates for their chapter.
   */
  list: async (adminUser) => {
    const filter = { isActive: true };
    const role = adminUser?.role;

    if (role === "central_admin" || role === "secretariat") {
      // No extra filter – see all
    } else if (role === "state_admin") {
      filter.level = "State";
      if (adminUser.state) filter.state = adminUser.state;
    } else if (role === "chapter_admin") {
      filter.level = "Chapter";
      if (adminUser.chapterId) filter.chapterId = adminUser.chapterId;
    }

    const templates = await RolePermissionTemplate.find(filter)
      .populate("chapterId", "name slug city state")
      .populate("createdBy", "name email")
      .sort({ level: 1, name: 1 })
      .lean();

    return templates;
  },

  /**
   * Get single template by ID (with scoped access check).
   */
  getById: async (id, adminUser) => {
    const tpl = await RolePermissionTemplate.findById(id)
      .populate("chapterId", "name slug city state")
      .populate("createdBy", "name email")
      .lean();

    if (!tpl) throw new AppError("Permission template not found", 404);
    _assertAccess(tpl, adminUser);
    return tpl;
  },

  /**
   * Create or update (upsert) a role permission configuration.
   * Restricts roles strictly to predefined chamber leadership roles.
   */
  create: async (data, adminUser) => {
    const { name, level, state, chapterId, permissions, allowedNavRoutes, description } = data;

    if (!name || !level) {
      throw new AppError("Role name and hierarchy level are required", 400);
    }

    const trimmedName = name.trim();
    if (!LEADER_ROLES.includes(trimmedName)) {
      throw new AppError(`Invalid role. Must be one of: ${LEADER_ROLES.join(", ")}`, 400);
    }

    // Enforce scope: State admin can only create State templates; Chapter admin only Chapter templates.
    _assertCreateScope(level, adminUser);

    const finalState = adminUser?.role === "state_admin" ? (adminUser.state || state || null) : (state || null);
    const finalChapterId = adminUser?.role === "chapter_admin" ? (adminUser.chapterId || chapterId || null) : (chapterId || null);

    // Upsert: check if a configuration already exists for this role + level + scope
    let tpl = await RolePermissionTemplate.findOne({
      name: trimmedName,
      level,
      state: finalState,
      chapterId: finalChapterId,
    });

    if (tpl) {
      tpl.permissions = Array.isArray(permissions) ? permissions : [];
      tpl.allowedNavRoutes = Array.isArray(allowedNavRoutes) ? allowedNavRoutes : [];
      if (description !== undefined) tpl.description = description;
      tpl.isActive = true;
      await tpl.save();
    } else {
      tpl = await RolePermissionTemplate.create({
        name: trimmedName,
        level,
        state: finalState,
        chapterId: finalChapterId,
        permissions: Array.isArray(permissions) ? permissions : [],
        allowedNavRoutes: Array.isArray(allowedNavRoutes) ? allowedNavRoutes : [],
        description: description || "",
        isActive: true,
        createdBy: adminUser?._id || adminUser?.id || null,
      });
    }

    await auditService.logAction({
      actor: adminUser,
      action: "CONFIGURE_ROLE_PERMISSIONS",
      targetModel: "RolePermissionTemplate",
      targetId: tpl._id,
      summary: `Configured permissions for role "${tpl.name}" (${tpl.level})`,
    }).catch(console.error);

    return tpl;
  },

  /**
   * Update an existing template.
   */
  update: async (id, data, adminUser) => {
    const tpl = await RolePermissionTemplate.findById(id);
    if (!tpl) throw new AppError("Permission template not found", 404);
    _assertAccess(tpl, adminUser);

    const { name, level, state, chapterId, permissions, allowedNavRoutes, description, isActive } = data;

    if (name !== undefined) tpl.name = name.trim();
    if (level !== undefined) tpl.level = level;
    if (state !== undefined) tpl.state = state || null;
    if (chapterId !== undefined) tpl.chapterId = chapterId || null;
    if (permissions !== undefined) tpl.permissions = Array.isArray(permissions) ? permissions : [];
    if (allowedNavRoutes !== undefined) tpl.allowedNavRoutes = Array.isArray(allowedNavRoutes) ? allowedNavRoutes : [];
    if (description !== undefined) tpl.description = description;
    if (isActive !== undefined) tpl.isActive = Boolean(isActive);

    await tpl.save();

    await auditService.logAction({
      actor: adminUser,
      action: "UPDATE",
      targetModel: "RolePermissionTemplate",
      targetId: tpl._id,
      summary: `Updated permission template "${tpl.name}"`,
    }).catch(console.error);

    return tpl;
  },

  /**
   * Delete (soft-delete) a template.
   */
  delete: async (id, adminUser) => {
    const tpl = await RolePermissionTemplate.findById(id);
    if (!tpl) throw new AppError("Permission template not found", 404);
    _assertAccess(tpl, adminUser);

    tpl.isActive = false;
    await tpl.save();

    await auditService.logAction({
      actor: adminUser,
      action: "DELETE",
      targetModel: "RolePermissionTemplate",
      targetId: id,
      summary: `Deactivated permission template "${tpl.name}"`,
    }).catch(console.error);

    return { message: "Permission template deactivated successfully" };
  },
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _assertAccess(tpl, adminUser) {
  const role = adminUser?.role;
  if (role === "central_admin" || role === "secretariat") return; // full access
  if (role === "state_admin") {
    if (tpl.level !== "State") throw new AppError("Access denied", 403);
    if (adminUser.state && tpl.state && tpl.state !== adminUser.state) {
      throw new AppError("Access denied: template belongs to a different state", 403);
    }
    return;
  }
  if (role === "chapter_admin") {
    if (tpl.level !== "Chapter") throw new AppError("Access denied", 403);
    if (
      adminUser.chapterId &&
      tpl.chapterId &&
      String(tpl.chapterId) !== String(adminUser.chapterId)
    ) {
      throw new AppError("Access denied: template belongs to a different chapter", 403);
    }
    return;
  }
  throw new AppError("Access denied", 403);
}

function _assertCreateScope(level, adminUser) {
  const role = adminUser?.role;
  if (role === "central_admin" || role === "secretariat") return;
  if (role === "state_admin" && level !== "State") {
    throw new AppError("State admins can only create State-level permission templates", 403);
  }
  if (role === "chapter_admin" && level !== "Chapter") {
    throw new AppError("Chapter admins can only create Chapter-level permission templates", 403);
  }
}

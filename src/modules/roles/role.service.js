import { Role } from "./role.model.js";
import { RolePermissionTemplate } from "./role-permission-template.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { AppError } from "../../shared/errors/AppError.js";
import { auditService } from "../audit/audit.service.js";

export const roleService = {
  // Admin: Get all roles with filters
  getAllRoles: async (queryParams = {}, adminUser = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    if (queryParams.status) {
      filter.status = queryParams.status;
    }
    if (queryParams.role) {
      filter.role = queryParams.role;
    }
    if (queryParams.level && queryParams.level !== "all") {
      filter.level = queryParams.level;
    }
    if (queryParams.state && queryParams.state !== "all") {
      filter.state = queryParams.state;
    }
    if (queryParams.chapterId && queryParams.chapterId !== "all") {
      filter.chapterId = queryParams.chapterId;
    }

    // Role-based admin scoping:
    if (adminUser) {
      if (adminUser.role === "chapter_admin") {
        filter.level = "Chapter";
        if (adminUser.chapterId) filter.chapterId = adminUser.chapterId;
      } else if (adminUser.role === "state_admin") {
        filter.level = "State";
        if (adminUser.state) filter.state = adminUser.state;
      }
    }

    // Since we want to search by name/business, we might need to populate first or do a lookup.
    // Given the constraints, doing a basic search with Mongoose populate is tricky.
    // Instead, if search exists, we can first find matching users/businesses.
    if (queryParams.search) {
      const searchRegex = new RegExp(queryParams.search, "i");
      const matchingUsers = await User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }, { organization: searchRegex }]
      }).select("_id");
      
      const userIds = matchingUsers.map(u => u._id);
      filter.userId = { $in: userIds };
    }

    const [roles, total] = await Promise.all([
      Role.find(filter)
        .populate("userId", "name email avatar phone organization city state")
        .populate("businessId", "name slug logo industry city state")
        .populate("chapterId", "name slug city state")
        .populate("permissionTemplateId", "name level permissions allowedNavRoutes")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Role.countDocuments(filter),
    ]);

    return {
      roles,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  // Public: Get active roles for the public directory
  getPublicRoles: async (queryParams = {}) => {
    const filter = { status: "Active" };
    if (queryParams.level && queryParams.level !== "all") filter.level = queryParams.level;
    if (queryParams.state && queryParams.state !== "all") filter.state = new RegExp(`^${queryParams.state}$`, "i");
    if (queryParams.chapterId && queryParams.chapterId !== "all") filter.chapterId = queryParams.chapterId;

    const roles = await Role.find(filter)
      .populate({
        path: "userId",
        select: "name avatar organization city state email phone chapterId designation",
        populate: { path: "chapterId", select: "name slug city state" }
      })
      .populate("businessId", "name slug logo industry city state instagram linkedin website contactPerson roleInBusiness phone")
      .populate("chapterId", "name slug city state")
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    // For roles without a linked businessId, try to find user's business by owner
    const selectFields = "name slug logo industry city state instagram linkedin website contactPerson roleInBusiness phone";
    for (const role of roles) {
      if (!role.businessId && role.userId?._id) {
        const business = await Business.findOne({ owner: role.userId._id })
          .select(selectFields)
          .lean();
        if (business) role.businessId = business;
      }
    }

    // Sort by hierarchy: Central/Leadership > State > Chapter
    const levelOrder = { "Central": 1, "Leadership": 2, "State": 3, "Chapter": 4 };
    roles.sort((a, b) => {
      // First by displayOrder (if set, otherwise 0)
      const orderA = a.displayOrder || 0;
      const orderB = b.displayOrder || 0;
      if (orderA !== orderB) return orderA - orderB;
      
      // Then by level hierarchy
      const levelA = levelOrder[a.level] || 99;
      const levelB = levelOrder[b.level] || 99;
      if (levelA !== levelB) return levelA - levelB;

      // Then by createdAt
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    return roles;
  },

  // Admin: Create/Assign role
  createRole: async (data, adminUser) => {
    const { userId, businessId, role, status, displayOrder, level, state, chapterId, permissionTemplateId, panelType } = data;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    let finalLevel = level || "Central";
    let finalState = state || null;
    let finalChapterId = chapterId || null;

    if (adminUser) {
      if (adminUser.role === "chapter_admin") {
        finalLevel = "Chapter";
        finalChapterId = adminUser.chapterId || finalChapterId;
      } else if (adminUser.role === "state_admin") {
        finalLevel = "State";
        finalState = adminUser.state || finalState;
      }
    }

    // Check for duplicate assignment
    const existing = await Role.findOne({ 
      userId, 
      role, 
      level: finalLevel,
      state: finalState,
      chapterId: finalChapterId
    });
    if (existing) {
      throw new AppError(`User is already assigned this specific role`, 400);
    }

    let finalTemplateId = permissionTemplateId || null;
    let finalPanelType = panelType;

    if (data.panelAccess === false) {
      finalTemplateId = null;
      finalPanelType = null;
    } else {
      if (!finalPanelType) {
        finalPanelType = finalLevel === "Chapter" ? "chapter-admin" : finalLevel === "State" ? "state-admin" : "central-admin";
      }
      if (!finalTemplateId) {
        const matchingTpl = await RolePermissionTemplate.findOne({
          name: role,
          level: finalLevel,
          isActive: true,
          $or: [
            { chapterId: finalChapterId },
            { state: finalState },
            { chapterId: null, state: null },
          ],
        }).sort({ chapterId: -1, state: -1 });

        if (matchingTpl) {
          finalTemplateId = matchingTpl._id;
        }
      }
    }

    const assignedRole = await Role.create({
      userId,
      businessId: businessId || null,
      role,
      status: status || "Active",
      displayOrder: displayOrder || 0,
      level: finalLevel,
      state: finalState,
      chapterId: finalChapterId,
      permissionTemplateId: finalTemplateId,
      panelType: finalPanelType,
    });

    await assignedRole.populate("userId", "name email avatar");
    if (assignedRole.permissionTemplateId) {
      await assignedRole.populate("permissionTemplateId", "name level permissions allowedNavRoutes");
    }

    // Log action
    if (adminUser) {
      await auditService.logAction({
        actor: adminUser,
        action: "CREATE",
        targetModel: "Role",
        targetId: assignedRole._id,
        summary: `Assigned role ${role} to ${user.name}`,
      }).catch(console.error);
    }

    return assignedRole;
  },

  // Admin: Update role assignment
  updateRole: async (id, data, adminUser) => {
    const roleDoc = await Role.findById(id);
    if (!roleDoc) {
      throw new AppError("Role assignment not found", 404);
    }

    // If role/user/level is changing, check for duplicates
    if (data.userId || data.role || data.level || data.state !== undefined || data.chapterId !== undefined) {
      const checkUserId = data.userId || roleDoc.userId;
      const checkRole = data.role || roleDoc.role;
      const checkLevel = data.level || roleDoc.level;
      const checkState = data.state !== undefined ? data.state : roleDoc.state;
      const checkChapter = data.chapterId !== undefined ? data.chapterId : roleDoc.chapterId;

      const existing = await Role.findOne({ 
        userId: checkUserId, 
        role: checkRole,
        level: checkLevel,
        state: checkState || null,
        chapterId: checkChapter || null
      });

      if (existing && existing._id.toString() !== id) {
        throw new AppError(`User is already assigned this specific role`, 400);
      }
    }

    // Handle panelAccess toggle
    if (data.panelAccess === false) {
      data.permissionTemplateId = null;
      data.panelType = null;
    } else if (data.panelAccess === true) {
      const targetRole = data.role || roleDoc.role;
      const targetLevel = data.level || roleDoc.level;
      const targetState = data.state !== undefined ? data.state : roleDoc.state;
      const targetChapterId = data.chapterId !== undefined ? data.chapterId : roleDoc.chapterId;
      data.panelType = targetLevel === "Chapter" ? "chapter-admin" : targetLevel === "State" ? "state-admin" : "central-admin";
      if (!data.permissionTemplateId) {
        const matchingTpl = await RolePermissionTemplate.findOne({
          name: targetRole,
          level: targetLevel,
          isActive: true,
          $or: [
            { chapterId: targetChapterId },
            { state: targetState },
            { chapterId: null, state: null },
          ],
        }).sort({ chapterId: -1, state: -1 });
        if (matchingTpl) {
          data.permissionTemplateId = matchingTpl._id;
        }
      }
    }

    const updatedRole = await Role.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate("userId", "name email avatar")
      .populate("permissionTemplateId", "name level permissions allowedNavRoutes");

    // Log action
    if (adminUser) {
      const changes = [];
      if (data.role && data.role !== roleDoc.role) changes.push(`role to ${data.role}`);
      if (data.status && data.status !== roleDoc.status) changes.push(`status to ${data.status}`);
      
      if (changes.length > 0) {
        await auditService.logAction({
          actor: adminUser,
          action: "UPDATE",
          targetModel: "Role",
          targetId: roleDoc._id,
          summary: `Updated role assignment: ${changes.join(", ")}`,
        }).catch(console.error);
      }
    }

    return updatedRole;
  },

  // Admin: Delete/Remove role assignment
  deleteRole: async (id, adminUser) => {
    const roleDoc = await Role.findById(id).populate("userId", "name");
    if (!roleDoc) {
      throw new AppError("Role assignment not found", 404);
    }

    await Role.findByIdAndDelete(id);

    // Log action
    if (adminUser) {
      await auditService.logAction({
        actor: adminUser,
        action: "DELETE",
        targetModel: "Role",
        targetId: id,
        summary: `Removed role ${roleDoc.role} from ${roleDoc.userId?.name || 'User'}`,
      }).catch(console.error);
    }

    return { message: "Role assignment removed successfully" };
  },
};

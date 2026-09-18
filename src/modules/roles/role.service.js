import { Role } from "./role.model.js";
import { User } from "../users/user.model.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { AppError } from "../../shared/errors/AppError.js";
import { auditService } from "../audit/audit.service.js";

export const roleService = {
  // Admin: Get all roles with filters
  getAllRoles: async (queryParams = {}) => {
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
    if (queryParams.state && queryParams.state !== "all") filter.state = queryParams.state;
    if (queryParams.chapterId && queryParams.chapterId !== "all") filter.chapterId = queryParams.chapterId;

    const roles = await Role.find(filter)
      .populate("userId", "name avatar organization city state")
      .populate("businessId", "name slug logo industry city state")
      .populate("chapterId", "name slug city state")
      .sort({ displayOrder: 1, createdAt: 1 });
      
    return roles;
  },

  // Admin: Create/Assign role
  createRole: async (data, adminUser) => {
    const { userId, businessId, role, status, displayOrder, level, state, chapterId } = data;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Check for duplicate assignment
    const existing = await Role.findOne({ 
      userId, 
      role, 
      level: level || "Central",
      state: state || null,
      chapterId: chapterId || null
    });
    if (existing) {
      throw new AppError(`User is already assigned this specific role`, 400);
    }

    const assignedRole = await Role.create({
      userId,
      businessId: businessId || null,
      role,
      status: status || "Active",
      displayOrder: displayOrder || 0,
      level: level || "Central",
      state: state || null,
      chapterId: chapterId || null,
    });

    await assignedRole.populate("userId", "name email avatar");

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

    const updatedRole = await Role.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate("userId", "name email avatar");

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

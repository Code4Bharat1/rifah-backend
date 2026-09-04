import { User } from "./user.model.js";
import { NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError } from "../../shared/errors/errors.js";
import { comparePassword } from "../../infrastructure/auth/password.js";
import { ERROR_CODES } from "../../shared/errors/error-codes.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";

export const userService = {
  /**
   * Get user profile by ID
   */
  getUserById: async (userId) => {
    const user = await User.findById(userId).populate("savedBusinesses");
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  },

  /**
   * Update own user profile
   */
  updateProfile: async (userId, updateData) => {
    const allowedUpdates = ["name", "email", "phone", "chapter", "organization", "city", "taxId", "avatar"];
    const filteredUpdates = {};
    for (const key of allowedUpdates) {
      if (updateData[key] !== undefined) {
        filteredUpdates[key] = updateData[key];
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, filteredUpdates, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      throw new NotFoundError("User not found");
    }

    return updatedUser;
  },

  /**
   * Toggle save/bookmark business for customer
   */
  toggleSaveBusiness: async (userId, businessId) => {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const isAlreadySaved = user.savedBusinesses.some(
      (bId) => String(bId) === String(businessId)
    );

    if (isAlreadySaved) {
      user.savedBusinesses = user.savedBusinesses.filter(
        (bId) => String(bId) !== String(businessId)
      );
    } else {
      user.savedBusinesses.push(businessId);
    }

    await user.save();
    return {
      saved: !isAlreadySaved,
      savedBusinesses: user.savedBusinesses,
    };
  },

  /**
   * List all users (admin)
   */
  listUsers: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // RBAC: Chapter Admin Scope Enforcement
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      filter.chapter = requester.chapter;
    } else if (queryParams.chapter) {
      filter.chapter = queryParams.chapter;
    }

    if (queryParams.role) {
      filter.role = queryParams.role;
    }
    if (queryParams.status) {
      filter.status = queryParams.status;
    }
    if (queryParams.search) {
      filter.$or = [
        { name: { $regex: queryParams.search, $options: "i" } },
        { email: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    return {
      users,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * Update user status or role (admin)
   */
  updateUserStatus: async (userId, { status, role }, requester) => {
    const userToUpdate = await User.findById(userId);
    if (!userToUpdate) {
      throw new NotFoundError("User not found");
    }

    // Role-based constraints for Chapter Admin
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (userToUpdate.chapter !== requester.chapter) {
        throw new ForbiddenError("Cannot modify users outside your chapter");
      }
      if (userToUpdate.role === ROLES.SUPER_ADMIN || userToUpdate.role === ROLES.SECRETARIAT) {
        throw new ForbiddenError("Cannot modify global admins");
      }
      if (role && [ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN].includes(role)) {
        throw new ForbiddenError("Cannot assign privileged roles");
      }
    }

    if (status) userToUpdate.status = status;
    if (role) userToUpdate.role = role;

    await userToUpdate.save();
    return userToUpdate;
  },

  /**
   * Invite a new member to the platform
   */
  inviteUser: async (email, requester) => {
    // Only Chapter Admins and above can invite
    if (![ROLES.SUPER_ADMIN, ROLES.SECRETARIAT, ROLES.CHAPTER_ADMIN].includes(requester.role)) {
      throw new ForbiddenError("Insufficient permissions to invite members");
    }
    
    // Default to the requester's chapter for Chapter Admins
    const chapterName = requester.role === ROLES.CHAPTER_ADMIN ? requester.chapter : "Mumbai Chapter";
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError("User already exists with this email");
    }

    // Send the invite email
    const { emailService } = await import("../../infrastructure/email/email.service.js");
    await emailService.sendMemberInvite(email, chapterName, requester.name);
    
    return { email, chapter: chapterName };
  },
  /**
   * Deactivate own user account
   */
  deactivateAccount: async (userId, { password, reason } = {}) => {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (password) {
      const isMatch = await comparePassword(password, user.passwordHash);
      if (!isMatch) {
        throw new UnauthorizedError("Incorrect password confirmation", ERROR_CODES.INVALID_CREDENTIALS);
      }
    }

    user.status = "Deactivated";
    await user.save();

    return { message: "Account has been deactivated successfully" };
  },
};

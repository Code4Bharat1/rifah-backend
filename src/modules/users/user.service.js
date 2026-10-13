import { User } from "./user.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError } from "../../shared/errors/errors.js";
import { comparePassword } from "../../infrastructure/auth/password.js";
import { ERROR_CODES } from "../../shared/errors/error-codes.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";

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
    const allowedUpdates = [
      "name",
      "email",
      "phone",
      "chapter",
      "organization",
      "businessName",
      "category",
      "subCategory",
      "country",
      "countryCode",
      "city",
      "state",
      "taxId",
      "avatar",
      "subscriberTier",
      "membershipPlan",
    ];
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

    // Keep business subscriberTier in sync with user
    if (filteredUpdates.subscriberTier || filteredUpdates.membershipPlan) {
      const targetTier = filteredUpdates.subscriberTier || filteredUpdates.membershipPlan;
      try {
        await Business.updateMany(
          { owner: userId },
          {
            $set: {
              subscriberTier: targetTier,
              membership: targetTier,
            },
          }
        );
      } catch (err) {
        console.error("[USER SERVICE] Failed to sync business subscriberTier:", err);
      }
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
    await user.populate("savedBusinesses");
    return {
      saved: !isAlreadySaved,
      savedBusinesses: (user.savedBusinesses || []).filter(Boolean),
    };
  },

  /**
   * List all users (admin)
   */
  listUsers: async (queryParams = {}, requester = null) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

    // RBAC: Chapter Admin Scope Enforcement
    const chapterScope = await getChapterFilter(requester, 'direct_id');
    Object.assign(filter, chapterScope);

    if (queryParams.chapter && !chapterScope.chapterId) {
      filter.chapter = queryParams.chapter;
    }

    if (queryParams.country && !filter.country && !filter.$or) {
      filter.country = { $regex: new RegExp(`^${queryParams.country.trim()}$`, "i") };
    }

    if (queryParams.state) {
      filter.state = { $regex: new RegExp(`^${queryParams.state.trim()}$`, "i") };
    }

    if (queryParams.role) {
      if (queryParams.role.includes(",")) {
        filter.role = { $in: queryParams.role.split(",") };
      } else {
        filter.role = queryParams.role;
      }
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
    const chapterScope = await getChapterFilter(requester, 'direct_id');
    const userToUpdate = await User.findOne({ _id: userId, ...chapterScope });
    if (!userToUpdate) {
      throw new NotFoundError("User not found or access denied");
    }

    // Role-based constraints for Country Admin
    if (requester && requester.role === ROLES.COUNTRY_ADMIN) {
      if (userToUpdate.role === ROLES.CENTRAL_ADMIN) {
        throw new ForbiddenError("Cannot modify Central Admins");
      }
    }

    // Role-based constraints for Chapter Admin
    if (requester && requester.role === ROLES.CHAPTER_ADMIN) {
      if (String(userToUpdate.chapterId || "") !== String(requester.chapterId || "")) {
        throw new ForbiddenError("Cannot modify users outside your chapter");
      }
      if (userToUpdate.role === ROLES.CENTRAL_ADMIN || userToUpdate.role === ROLES.STATE_ADMIN) {
        throw new ForbiddenError("Cannot modify higher-tier admins");
      }
      if (role) {
        throw new ForbiddenError("Chapter Admins are not authorized to change user roles");
      }
    }

    // SECURITY: this generic endpoint may only ever demote to customer/business_owner.
    // Granting an admin tier must always go through its dedicated, eligibility-checked
    // assignment endpoint (chapter/state admin assignment, central admin transfer) —
    // never here, where there is no paid/verified business check or singleton enforcement.
    if (role && ![ROLES.CUSTOMER, ROLES.BUSINESS_OWNER].includes(role)) {
      throw new ForbiddenError("Admin roles can only be granted through their dedicated assignment endpoints.");
    }

    if (status) userToUpdate.status = status;
    if (role) userToUpdate.role = role;

    await userToUpdate.save();

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return userToUpdate;
  },

  /**
   * Assign an administrative role to a user (privileged operation).
   * Enforces hierarchy: only higher-ranked admins can promote users to admin tiers.
   */
  assignAdminRole: async (userId, { role }, requester) => {
    if (!requester) throw new ForbiddenError("Authentication required");

    const adminRoles = [ROLES.CHAPTER_ADMIN, ROLES.STATE_ADMIN, ROLES.COUNTRY_ADMIN, ROLES.CENTRAL_ADMIN];
    if (!adminRoles.includes(role)) {
      throw new BadRequestError(`Role must be one of: ${adminRoles.join(", ")}`);
    }

    // Hierarchy enforcement: who can grant what?
    if (requester.role === ROLES.CHAPTER_ADMIN) {
      throw new ForbiddenError("Chapter Admins cannot assign admin roles.");
    }
    if (requester.role === ROLES.STATE_ADMIN) {
      if (role !== ROLES.CHAPTER_ADMIN) {
        throw new ForbiddenError("State Admins can only assign Chapter Admin roles.");
      }
    }
    if (requester.role === ROLES.COUNTRY_ADMIN) {
      if (![ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN].includes(role)) {
        throw new ForbiddenError("Country Admins can only assign State/City Admin or Chapter Admin roles within their country.");
      }
    }
    // Only Central Admins can assign country_admin or central_admin
    if ([ROLES.COUNTRY_ADMIN, ROLES.CENTRAL_ADMIN].includes(role) && requester.role !== ROLES.CENTRAL_ADMIN) {
      throw new ForbiddenError("Only Central Admins can grant Country Admin or Central Admin roles.");
    }

    // Central Admin IS the India Admin — no separate Country Admin for India should exist.
    // Scope check first so we have the target user's country available.
    const chapterScope = await getChapterFilter(requester, "direct_id");
    const userToUpdate = await User.findOne({ _id: userId, ...chapterScope });
    if (!userToUpdate) {
      throw new NotFoundError("User not found or outside your administrative scope");
    }

    if (role === ROLES.COUNTRY_ADMIN) {
      const targetCountry = (userToUpdate.country || "india").trim().toLowerCase();
      if (!targetCountry || targetCountry === "india") {
        throw new BadRequestError(
          "Cannot assign Country Admin to an India-based user. Central Admin already manages India."
        );
      }
    }

    // Prevent demoting higher-ranked admins (e.g. Country Admin cannot re-assign a Central Admin)
    const roleRank = { customer: 0, business_owner: 0, chapter_admin: 1, state_admin: 2, country_admin: 3, central_admin: 4 };
    if ((roleRank[userToUpdate.role] || 0) >= (roleRank[requester.role] || 0)) {
      throw new ForbiddenError("Cannot modify a user with equal or higher administrative rank.");
    }

    userToUpdate.role = role;
    await userToUpdate.save();

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return userToUpdate;
  },

  /**
   * Invite a new member to the platform
   */
  inviteUser: async (email, requester) => {
    // Country Admins can also invite
    const isAuthorized = [
      ROLES.CENTRAL_ADMIN,
      ROLES.COUNTRY_ADMIN,
      ROLES.STATE_ADMIN,
      ROLES.CHAPTER_ADMIN,
    ].includes(requester.role);
    if (!isAuthorized) {
      throw new ForbiddenError("Insufficient permissions to invite members");
    }

    // Determine the context label for the invite email
    let inviteContext;
    if (requester.role === ROLES.CHAPTER_ADMIN) {
      inviteContext = requester.chapter || "Your Chapter";
    } else if (requester.role === ROLES.COUNTRY_ADMIN) {
      inviteContext = requester.country || "Your Country";
    } else if (requester.role === ROLES.STATE_ADMIN) {
      inviteContext = requester.state || "Your Region";
    } else {
      // Central Admin is the India Admin by default
      inviteContext = "India";
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError("User already exists with this email");
    }

    // Send the invite email
    const { emailService } = await import("../../infrastructure/email/email.service.js");
    await emailService.sendMemberInvite(email, inviteContext, requester.name);

    return { email, context: inviteContext };
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

    // Real-time Copilot Knowledge Base Sync: automatically purges deactivated user from KB file
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return { message: "Account has been deactivated successfully" };
  },
};

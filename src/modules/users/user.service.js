import { User } from "./user.model.js";
import { Business } from "../businesses/business.model.js";
import { NotFoundError, BadRequestError, UnauthorizedError, ForbiddenError } from "../../shared/errors/errors.js";
import { comparePassword } from "../../infrastructure/auth/password.js";
import { ERROR_CODES } from "../../shared/errors/error-codes.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";
import { ROLES } from "../../shared/constants/roles.js";
import { getChapterFilter } from "../../shared/utils/chapter-scope.js";
import { googleDriveSyncService } from "../google-drive/google-drive-sync.service.js";
import { escapeRegex } from "../../middleware/sanitize.middleware.js";

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
  updateProfile: async (userId, updateData, callerUser = null) => {
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

    // Security: Prevent non-admin users from escalating to paid tiers via profile update
    const isAdmin = callerUser && ["central_admin", "country_admin", "state_admin", "chapter_admin"].includes(callerUser.role);
    if (!isAdmin) {
      if (filteredUpdates.subscriberTier) {
        const normalized = String(filteredUpdates.subscriberTier).toLowerCase();
        if (normalized !== "tier_1" && !normalized.includes("free")) {
          delete filteredUpdates.subscriberTier;
        }
      }
      if (filteredUpdates.membershipPlan) {
        const normalized = String(filteredUpdates.membershipPlan).toLowerCase();
        if (normalized !== "tier_1" && !normalized.includes("free")) {
          delete filteredUpdates.membershipPlan;
        }
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

    // Automatically queue debounced Google Drive sync for Users spreadsheet
    try {
      googleDriveSyncService.queueSync("users");
    } catch (_) {}

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
    
    // RBAC: Chapter/Country Admin Scope Enforcement
    const chapterScope = await getChapterFilter(requester, 'direct_id');
    const andConditions = [];
    if (Object.keys(chapterScope).length > 0) {
      andConditions.push(chapterScope);
    }

    const simpleFilters = {};

    if (queryParams.chapter && !chapterScope.chapterId) {
      simpleFilters.chapter = queryParams.chapter;
    }

    if (queryParams.country && !chapterScope.country && !chapterScope.countryId) {
      simpleFilters.country = { $regex: new RegExp(`^${queryParams.country.trim()}$`, "i") };
    }

    if (queryParams.state) {
      simpleFilters.state = { $regex: new RegExp(`^${queryParams.state.trim()}$`, "i") };
    }

    if (queryParams.role) {
      if (queryParams.role.includes(",")) {
        simpleFilters.role = { $in: queryParams.role.split(",") };
      } else {
        simpleFilters.role = queryParams.role;
      }
    }
    if (queryParams.status) {
      simpleFilters.status = queryParams.status;
    }

    if (Object.keys(simpleFilters).length > 0) {
      andConditions.push(simpleFilters);
    }

    if (queryParams.search) {
      const safeSearch = escapeRegex(String(queryParams.search).trim());
      if (safeSearch) {
        andConditions.push({
          $or: [
            { name: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
            { phone: { $regex: safeSearch, $options: "i" } },
          ],
        });
      }
    }

    const filter = andConditions.length > 0 ? (andConditions.length === 1 ? andConditions[0] : { $and: andConditions }) : {};

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

    const responsibilityRoles = [
      ROLES.GUEST_SPEAKER_MANAGER,
      ROLES.GUEST_MANAGER,
      ROLES.EVENT_COORDINATOR,
      ROLES.EVENT_COORDINATOR_CAMEL,
      "event_coordinator",
      "eventCoordinator",
      "guest_speaker_manager",
      "guestManager",
    ];
    const adminRoles = [
      ROLES.CHAPTER_ADMIN,
      ROLES.STATE_ADMIN,
      ROLES.COUNTRY_ADMIN,
      ROLES.CENTRAL_ADMIN,
      ...responsibilityRoles,
    ];
    if (!adminRoles.includes(role)) {
      throw new BadRequestError(`Role must be one of: ${adminRoles.join(", ")}`);
    }

    // Hierarchy enforcement: who can grant what?
    if (requester.role === ROLES.CHAPTER_ADMIN) {
      if (!responsibilityRoles.includes(role)) {
        throw new ForbiddenError("Chapter Admins can only assign event responsibility roles (Guest & Speaker Manager, Events Coordinator).");
      }
    }
    if (requester.role === ROLES.STATE_ADMIN) {
      if (role !== ROLES.CHAPTER_ADMIN && !responsibilityRoles.includes(role)) {
        throw new ForbiddenError("State Admins can only assign Chapter Admin or event responsibility roles.");
      }
    }
    if (requester.role === ROLES.COUNTRY_ADMIN) {
      if (![ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN, ...responsibilityRoles].includes(role)) {
        throw new ForbiddenError("Country Admins can only assign State/City Admin, Chapter Admin, or event responsibility roles within their country.");
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

    // Prevent demoting higher-ranked admins (e.g. Country Admin cannot re-assign a Central Admin)
    const roleRank = {
      customer: 0,
      business_owner: 0,
      guest_speaker_manager: 0.5,
      guestManager: 0.5,
      event_coordinator: 0.5,
      eventCoordinator: 0.5,
      chapter_admin: 1,
      state_admin: 2,
      country_admin: 3,
      central_admin: 4,
    };
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

  /**
   * Permanently delete a user account and all associated data from the database.
   */
  permanentlyDeleteUser: async (userId, requester) => {
    const userToDelete = await User.findById(userId);
    if (!userToDelete) {
      throw new NotFoundError("User not found");
    }

    const isSelfDelete = requester && String(requester.id || requester._id) === String(userId);

    if (!isSelfDelete && requester) {
      // Permission checks for admin-driven deletion
      if (requester.role === ROLES.CHAPTER_ADMIN) {
        const adminTiers = [ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN, ROLES.STATE_ADMIN, ROLES.CHAPTER_ADMIN];
        if (adminTiers.includes(userToDelete.role)) {
          throw new ForbiddenError("Chapter Admins cannot delete administrative accounts");
        }
        if (
          userToDelete.chapterId &&
          requester.chapterId &&
          String(userToDelete.chapterId) !== String(requester.chapterId)
        ) {
          throw new ForbiddenError("Chapter Admins can only delete members of their own chapter");
        }
      }

      if (requester.role === ROLES.STATE_ADMIN) {
        if ([ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN, ROLES.STATE_ADMIN].includes(userToDelete.role)) {
          throw new ForbiddenError("State Admins cannot delete State, Country, or Central Admins");
        }
        if (
          userToDelete.state &&
          requester.state &&
          userToDelete.state.trim().toLowerCase() !== requester.state.trim().toLowerCase()
        ) {
          throw new ForbiddenError("State Admins can only delete members within their jurisdiction");
        }
      }

      if (requester.role === ROLES.COUNTRY_ADMIN) {
        if ([ROLES.CENTRAL_ADMIN, ROLES.COUNTRY_ADMIN].includes(userToDelete.role)) {
          throw new ForbiddenError("Country Admins cannot delete Central or Country Admins");
        }
      }

      if (userToDelete.role === ROLES.CENTRAL_ADMIN) {
        const centralAdminCount = await User.countDocuments({ role: ROLES.CENTRAL_ADMIN });
        if (centralAdminCount <= 1) {
          throw new BadRequestError("Cannot delete the only Central Admin account in the system");
        }
      }
    } else if (isSelfDelete) {
      if (userToDelete.role === ROLES.CENTRAL_ADMIN) {
        const centralAdminCount = await User.countDocuments({ role: ROLES.CENTRAL_ADMIN });
        if (centralAdminCount <= 1) {
          throw new BadRequestError("Cannot delete the only Central Admin account");
        }
      }
    }

    // 1. Find all businesses owned by this user
    const businesses = await Business.find({ owner: userId }).select("_id");
    const businessIds = businesses.map((b) => b._id);

    // 2. Import optional models dynamically or safely to perform deep cascading cleanup
    const [
      { Catalogue },
      { Branch },
      { Verification },
      { Membership },
      { Advertisement },
      { Enquiry },
      { Lead },
      { Review },
      { Notification },
      { Role },
      { Ticket },
      { Query },
      { Followup },
      { Event },
      { CourseProgress },
      { Certificate },
    ] = await Promise.all([
      import("../catalogue/catalogue.model.js"),
      import("../branches/branch.model.js"),
      import("../verification/verification.model.js"),
      import("../memberships/membership.model.js"),
      import("../advertisements/advertisement.model.js"),
      import("../enquiries/enquiry.model.js"),
      import("../leads/lead.model.js"),
      import("../reviews/review.model.js"),
      import("../notifications/notification.model.js"),
      import("../roles/role.model.js"),
      import("../tickets/ticket.model.js"),
      import("../queries/query.model.js"),
      import("../followups/followup.model.js"),
      import("../events/event.model.js"),
      import("../courses/courseProgress.model.js"),
      import("../courses/certificate.model.js"),
    ]);

    // 3. Delete all business-linked records
    if (businessIds.length > 0) {
      await Promise.allSettled([
        Catalogue.deleteMany({ businessId: { $in: businessIds } }),
        Branch.deleteMany({ businessId: { $in: businessIds } }),
        Verification.deleteMany({ businessId: { $in: businessIds } }),
        Membership.deleteMany({ business: { $in: businessIds } }),
        Advertisement.deleteMany({ businessId: { $in: businessIds } }),
        Enquiry.deleteMany({ businessId: { $in: businessIds } }),
        Lead.deleteMany({ businessId: { $in: businessIds } }),
        Review.deleteMany({ business: { $in: businessIds } }),
        Business.deleteMany({ _id: { $in: businessIds } }),
      ]);
    }

    // 4. Delete user-level records
    await Promise.allSettled([
      Enquiry.deleteMany({ $or: [{ buyerId: userId }, { sender: userId }, { user: userId }] }),
      Lead.deleteMany({ $or: [{ buyerId: userId }, { user: userId }] }),
      Review.deleteMany({ user: userId }),
      Notification.deleteMany({ $or: [{ recipient: userId }, { user: userId }] }),
      Role.deleteMany({ userId }),
      Ticket.deleteMany({ $or: [{ user: userId }, { createdBy: userId }] }),
      Query.deleteMany({ $or: [{ user: userId }, { createdBy: userId }] }),
      Followup.deleteMany({ $or: [{ userId }, { businessId: { $in: businessIds } }] }),
      CourseProgress.deleteMany({ user: userId }),
      Certificate.deleteMany({ user: userId }),
      Business.updateMany(
        { "gstGroupMembers.user": userId },
        { $pull: { gstGroupMembers: { user: userId } } }
      ),
      Event.updateMany(
        { "roleAssignments.user": userId },
        { $pull: { roleAssignments: { user: userId } } }
      ),
      User.updateMany(
        { savedBusinesses: { $in: businessIds } },
        { $pull: { savedBusinesses: { $in: businessIds } } }
      ),
      // Finally, hard delete the user document
      User.findByIdAndDelete(userId),
    ]);

    // 5. Sync Copilot Knowledge Base
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return { message: "Account and all associated data have been permanently deleted from the database" };
  },
};

import { User } from "./user.model.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";
import { parsePagination, buildPaginationMeta } from "../../shared/utils/pagination.js";

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
    const allowedUpdates = ["name", "phone", "chapter", "avatar"];
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
  listUsers: async (queryParams = {}) => {
    const { page, limit, skip, sort } = parsePagination(queryParams);
    const filter = {};

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
  updateUserStatus: async (userId, { status, role }) => {
    const updates = {};
    if (status) updates.status = status;
    if (role) updates.role = role;

    const user = await User.findByIdAndUpdate(userId, updates, { new: true });
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  },
};

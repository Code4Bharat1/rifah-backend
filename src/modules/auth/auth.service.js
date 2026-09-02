import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { hashPassword, comparePassword } from "../../infrastructure/auth/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../infrastructure/auth/jwt.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { ERROR_CODES } from "../../shared/errors/error-codes.js";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { generateSlug } from "../../shared/utils/generate-id.js";

const googleClient = new OAuth2Client(env.GOOGLE.CLIENT_ID || undefined);

export const authService = {
  /**
   * Register a new standard user / customer / buyer
   */
  register: async ({ name, email, password, phone, chapter, organization, city, sourcingInterest }) => {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new ConflictError("An account with this email address already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone || "",
      chapter: chapter || "Mumbai Chapter",
      organization: organization || "",
      city: city || "Mumbai",
      sourcingInterest: sourcingInterest ? sourcingInterest.trim() : "",
      sourcingInterests: sourcingInterest ? [sourcingInterest.trim()] : [],
      role: ROLES.CUSTOMER,
      isProfileComplete: true,
    });

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return { user, accessToken, refreshToken };
  },

  /**
   * Register a business owner account
   */
  registerBusinessOwner: async ({ name, email, password, phone, chapter, businessName }) => {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new ConflictError("An account with this email address already exists");
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone: phone || "",
      chapter: chapter || "Mumbai Chapter",
      role: ROLES.BUSINESS_OWNER,
      isProfileComplete: true,
    });

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return { user, accessToken, refreshToken, pendingBusinessName: businessName };
  },

  /**
   * Login with email and password
   */
  login: async ({ email, password }) => {
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
    if (!user) {
      throw new UnauthorizedError("Invalid email or password", ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.status === "Suspended" || user.status === "Deactivated") {
      throw new UnauthorizedError(`Account is ${user.status.toLowerCase()}. Please contact support.`);
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid email or password", ERROR_CODES.INVALID_CREDENTIALS);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
      forcePasswordChange: user.forcePasswordChange,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    const userObj = user.toJSON();

    return { user: userObj, accessToken, refreshToken };
  },

  /**
   * Refresh Access Token using valid Refresh Token
   */
  refreshToken: async (incomingRefreshToken) => {
    try {
      const decoded = verifyRefreshToken(incomingRefreshToken);
      const user = await User.findById(decoded.id);

      if (!user || user.status !== "Active") {
        throw new UnauthorizedError("Invalid session or account deactivated");
      }

      const tokenPayload = {
        id: user._id,
        email: user.email,
        role: user.role,
      };

      const newAccessToken = signAccessToken(tokenPayload);
      const newRefreshToken = signRefreshToken(tokenPayload);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
      };
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired refresh token", ERROR_CODES.TOKEN_EXPIRED);
    }
  },

  /**
   * Get current authenticated user details
   */
  getMe: async (userId) => {
    const user = await User.findById(userId).populate("savedBusinesses");
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  },

  /**
   * Change password (forced or manual)
   */
  changePassword: async (userId, { newPassword }) => {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) {
      throw new NotFoundError("User not found");
    }

    user.passwordHash = await hashPassword(newPassword);
    user.forcePasswordChange = false;
    await user.save();

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
      forcePasswordChange: false,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return { user, accessToken, refreshToken };
  },
};

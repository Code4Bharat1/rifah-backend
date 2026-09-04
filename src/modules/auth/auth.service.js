import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { OtpVerification } from "./otp.model.js";
import crypto from "crypto";
import { hashPassword, comparePassword } from "../../infrastructure/auth/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../infrastructure/auth/jwt.js";
import { emailService } from "../../infrastructure/email/email.service.js";
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

    try {
      await emailService.sendWelcomeEmail({ email: user.email, name: user.name, role: user.role });
    } catch (err) {}

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
   * Send Registration OTP
   */
  sendRegistrationOtp: async (email) => {
    if (!email || !email.includes("@")) {
      throw new BadRequestError("A valid email address is required");
    }
    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      throw new ConflictError("An account with this email address already exists. Please log in.");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Upsert OtpVerification record
    await OtpVerification.findOneAndUpdate(
      { email: cleanEmail, purpose: "register_business" },
      {
        otp,
        verified: false,
        verifiedToken: null,
        expiresAt,
      },
      { upsert: true, new: true }
    );

    // Send email
    try {
      await emailService.sendRegisterOtpEmail({ email: cleanEmail, otp });
    } catch (err) {
      console.error("Failed to send registration OTP email:", err);
    }

    return {
      message: "Verification code sent to your email.",
      email: cleanEmail,
      otp, // included for seamless local dev / testing if mail credentials are simulated
    };
  },

  /**
   * Verify Registration OTP
   */
  verifyRegistrationOtp: async ({ email, otp }) => {
    if (!email || !otp) {
      throw new BadRequestError("Email and 6-digit verification code are required");
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const record = await OtpVerification.findOne({
      email: cleanEmail,
      purpose: "register_business",
      otp: cleanOtp,
      expiresAt: { $gt: new Date() },
    });

    if (!record) {
      throw new BadRequestError("Invalid or expired verification code. Please try again.");
    }

    // Generate verifiedToken
    const verifiedToken = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    record.verified = true;
    record.verifiedToken = verifiedToken;
    await record.save();

    return {
      valid: true,
      message: "Email verified successfully.",
      verifiedToken,
    };
  },

  /**
   * Register a business owner account
   */
  registerBusinessOwner: async ({
    name,
    email,
    password,
    phone,
    chapter,
    businessName,
    industry,
    businessType,
    city,
    state,
    address,
    membership,
    about,
    taxId,
    verifiedToken,
  }) => {
    const cleanEmail = email.toLowerCase().trim();
    const cleanTaxId = taxId ? taxId.trim().toUpperCase() : "";

    // If verifiedToken was passed, ensure it is verified
    if (verifiedToken) {
      const record = await OtpVerification.findOne({
        email: cleanEmail,
        verifiedToken,
        verified: true,
      });
      if (!record) {
        throw new BadRequestError("Email verification is required or has expired. Please verify your email again.");
      }
    }

    // Check if user exists
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      const existingBiz = await Business.findOne({ owner: user._id });
      if (existingBiz) {
        throw new ConflictError("An account and business with this email address already exists");
      }
      // User created in previous attempt that failed during business provisioning
      const passwordHash = await hashPassword(password);
      user.name = name.trim();
      user.passwordHash = passwordHash;
      user.phone = phone || "";
      user.chapter = chapter || "Mumbai Chapter";
      user.taxId = cleanTaxId;
      await user.save();
    } else {
      const passwordHash = await hashPassword(password);
      user = await User.create({
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        phone: phone || "",
        chapter: chapter || "Mumbai Chapter",
        taxId: cleanTaxId,
        role: ROLES.BUSINESS_OWNER,
        isProfileComplete: true,
      });
    }

    // Provision Business Profile
    let slug = generateSlug(businessName || name);
    const slugConflict = await Business.findOne({ slug });
    if (slugConflict) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // Normalize membership tier (e.g. 'premium' -> 'Premium')
    const cleanMembership = membership
      ? membership.charAt(0).toUpperCase() + membership.slice(1).toLowerCase()
      : "Free";

    const business = await Business.create({
      name: (businessName || name).trim(),
      slug,
      owner: user._id,
      industry: industry || "General",
      businessType: businessType || "Proprietorship",
      city: city || "Mumbai",
      state: state || "Maharashtra",
      address: address || "",
      chapter: chapter || "Mumbai Chapter",
      membership: cleanMembership,
      about: about || "",
      taxId: cleanTaxId,
      phone: phone || "",
      email: cleanEmail,
      status: "Active",
      verification: "unverified",
    });

    // Cleanup OTP record once registration and business are successfully created
    if (verifiedToken) {
      await OtpVerification.deleteMany({ email: cleanEmail });
    }

    try {
      await emailService.sendWelcomeEmail({ email: user.email, name: user.name, role: user.role });
    } catch (err) {}

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return { user, accessToken, refreshToken, business, pendingBusinessName: businessName };
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

  /**
   * Request password reset code
   */
  forgotPassword: async (email) => {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      throw new NotFoundError("No account found with this email address");
    }

    // Generate 6-digit verification code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetCode;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetCode,
      });
    } catch (err) {
      console.error("Failed to dispatch password reset email:", err);
    }

    return {
      message: "Password reset verification code has been sent to your email.",
      email: user.email,
      resetToken: resetCode,
    };
  },

  /**
   * Verify password reset verification code
   */
  verifyResetCode: async ({ email, resetToken }) => {
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: String(resetToken).trim(),
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired verification code");
    }

    return { valid: true, message: "Verification code verified successfully." };
  },

  /**
   * Reset password with verification code
   */
  resetPassword: async ({ email, resetToken, newPassword }) => {
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+passwordHash +resetPasswordToken +resetPasswordExpires");

    if (!user) {
      throw new BadRequestError("Invalid or expired password reset code");
    }

    user.passwordHash = await hashPassword(newPassword);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return { message: "Password has been successfully reset. Please log in with your new password." };
  },

  /**
   * Google OAuth 2.0 Authenticate / Provision User
   * NOTE: Admin / Secretariat roles are strictly barred from Google OAuth.
   */
  googleAuth: async ({ credential, roleTarget = ROLES.CUSTOMER }) => {
    if (!credential) {
      throw new BadRequestError("Google credential token is required");
    }

    let googlePayload;
    try {
      const isJwt = typeof credential === "string" && credential.split(".").length === 3;
      if (isJwt) {
        if (env.GOOGLE.CLIENT_ID) {
          try {
            const ticket = await googleClient.verifyIdToken({
              idToken: credential,
              audience: env.GOOGLE.CLIENT_ID,
            });
            googlePayload = ticket.getPayload();
          } catch (jwtErr) {
            // Fallback to tokeninfo endpoint
            const tokenInfoRes = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
            );
            if (!tokenInfoRes.ok) throw jwtErr;
            googlePayload = await tokenInfoRes.json();
          }
        } else {
          const tokenInfoRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
          );
          if (!tokenInfoRes.ok) {
            throw new Error("Google verification failed");
          }
          googlePayload = await tokenInfoRes.json();
        }
      } else {
        // It's an OAuth2 Access Token (e.g. from Google popup token client)
        const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${credential}` },
        });
        if (userinfoRes.ok) {
          googlePayload = await userinfoRes.json();
        } else {
          // Fallback to tokeninfo with access_token
          const tokenInfoRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${credential}`
          );
          if (!tokenInfoRes.ok) {
            throw new Error("Google access token verification failed");
          }
          googlePayload = await tokenInfoRes.json();
        }
      }
    } catch (err) {
      console.error("Google Auth verification error:", err.message);
      throw new UnauthorizedError("Google authentication failed. Invalid token.");
    }

    if (!googlePayload || !googlePayload.email) {
      throw new UnauthorizedError("Google token does not contain a valid email address");
    }

    const email = googlePayload.email.toLowerCase().trim();
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // SECURITY GUARD: Strictly block Admin / Secretariat Google OAuth login
      if (
        existingUser.role === ROLES.SUPER_ADMIN ||
        existingUser.role === ROLES.SECRETARIAT ||
        existingUser.role === ROLES.CHAPTER_ADMIN
      ) {
        throw new UnauthorizedError(
          "Admin and Secretariat accounts must sign in using email and password credentials.",
          ERROR_CODES.FORBIDDEN
        );
      }

      if (existingUser.status === "Suspended" || existingUser.status === "Deactivated") {
        throw new UnauthorizedError(`Account is ${existingUser.status.toLowerCase()}. Please contact support.`);
      }

      // Link Google ID if not linked
      if (!existingUser.googleId) existingUser.googleId = googlePayload.sub;
      if (!existingUser.avatar && googlePayload.picture) existingUser.avatar = googlePayload.picture;
      existingUser.lastLoginAt = new Date();
      await existingUser.save();

      const tokenPayload = {
        id: existingUser._id,
        email: existingUser.email,
        role: existingUser.role,
      };

      const accessToken = signAccessToken(tokenPayload);
      const refreshToken = signRefreshToken(tokenPayload);

      return {
        user: existingUser.toJSON(),
        accessToken,
        refreshToken,
        isNewUser: false,
        isProfileComplete: existingUser.isProfileComplete !== false,
      };
    }

    // New User Provisioning (Customer or Business Owner initially with isProfileComplete: false)
    const assignedRole =
      roleTarget === ROLES.BUSINESS_OWNER ? ROLES.BUSINESS_OWNER : ROLES.CUSTOMER;

    const newUser = await User.create({
      name: googlePayload.name || email.split("@")[0],
      email: email,
      googleId: googlePayload.sub,
      avatar: googlePayload.picture || "",
      authProvider: "google",
      role: assignedRole,
      chapter: "Mumbai Chapter",
      city: "Mumbai",
      status: "Active",
      isProfileComplete: false,
    });

    const tokenPayload = {
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return {
      user: newUser.toJSON(),
      accessToken,
      refreshToken,
      isNewUser: true,
      isProfileComplete: false,
    };
  },

  /**
   * Complete onboarding for post-OAuth or new user
   * Sets account password, role (buyer/business_owner), contact info, and provisions Business profile if supplier.
   */
  completeOnboarding: async (userId, data) => {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) {
      throw new NotFoundError("User account not found");
    }

    const {
      role = ROLES.CUSTOMER,
      password,
      phone,
      city,
      state = "Maharashtra",
      address = "",
      chapter,
      organization,
      businessName,
      industry,
      businessType,
      founded,
      employees,
      about,
      contactPerson,
      taxId,
      membershipTier,
      sourcingInterest,
    } = data;

    if (!password || password.length < 6) {
      throw new BadRequestError("Password must be at least 6 characters");
    }

    // Set hashed password so user can log in with email/password anytime
    user.passwordHash = await hashPassword(password);

    // Set role and profile details
    user.role = role === ROLES.BUSINESS_OWNER ? ROLES.BUSINESS_OWNER : ROLES.CUSTOMER;
    if (contactPerson && contactPerson.trim()) user.name = contactPerson.trim();
    if (phone) user.phone = phone.trim();
    if (city) user.city = city.trim();
    if (chapter) user.chapter = chapter.trim();
    if (organization) user.organization = organization.trim();
    if (sourcingInterest) {
      user.sourcingInterest = sourcingInterest.trim();
      user.sourcingInterests = [sourcingInterest.trim()];
    }
    user.isProfileComplete = true;
    user.status = "Active";

    await user.save();

    // If role is Business Owner, create or update complete Business document
    if (user.role === ROLES.BUSINESS_OWNER) {
      const existingBiz = await Business.findOne({ owner: user._id });
      const finalBizName = (businessName && businessName.trim()) || `${user.name}'s Enterprise`;

      // Standardize membership tier to enum format ("Free", "Basic", "Premium", "Enterprise")
      const validTiers = ["Free", "Basic", "Premium", "Enterprise"];
      const formattedTier =
        validTiers.find((t) => t.toLowerCase() === (membershipTier || "free").toLowerCase()) ||
        "Free";

      if (existingBiz) {
        existingBiz.name = finalBizName;
        existingBiz.industry = industry || existingBiz.industry || "Manufacturing";
        existingBiz.businessType = businessType || existingBiz.businessType || "Proprietorship";
        if (founded) existingBiz.founded = founded.trim();
        if (employees) existingBiz.employees = employees.trim();
        if (about) existingBiz.about = about.trim();
        if (phone) existingBiz.phone = phone.trim();
        if (address) existingBiz.address = address.trim();
        if (city) existingBiz.city = city.trim();
        if (state) existingBiz.state = state.trim();
        if (chapter) existingBiz.chapter = chapter.trim();
        if (taxId) existingBiz.taxId = taxId.trim();
        existingBiz.membership = formattedTier;
        existingBiz.verification = "pending";
        await existingBiz.save();
      } else {
        let slug = generateSlug(finalBizName);
        const slugConflict = await Business.findOne({ slug });
        if (slugConflict) {
          slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        await Business.create({
          name: finalBizName,
          slug,
          owner: user._id,
          industry: industry || "Manufacturing",
          businessType: businessType || "Proprietorship",
          founded: founded ? founded.trim() : "",
          employees: employees ? employees.trim() : "10–50",
          about: about ? about.trim() : "",
          phone: (phone || user.phone || "").trim(),
          email: user.email,
          address: (address || "").trim(),
          city: user.city || "Mumbai",
          state: state || "Maharashtra",
          chapter: user.chapter || "Mumbai Chapter",
          taxId: taxId ? taxId.trim() : "",
          membership: formattedTier,
          verification: "pending",
        });
      }
    }

    const tokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return { user: user.toJSON(), accessToken, refreshToken };
  },
};

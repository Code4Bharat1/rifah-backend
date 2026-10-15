import { Branch } from "./branch.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { Membership } from "../memberships/membership.model.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../../shared/errors/errors.js";
import { ROLES } from "../../shared/constants/roles.js";
import { resolveMemberPlanContext } from "../../shared/utils/feature-access.js";

/**
 * Normalizes tier name into canonical tier key
 */
function normalizeTier(str) {
  if (!str) return "tier_1";
  const s = String(str).toLowerCase().trim();
  if (
    s.includes("tier iv") ||
    s.includes("tier 4") ||
    s.includes("tier_4") ||
    s.includes("tier-4") ||
    s.includes("enterprise")
  ) {
    return "tier_4";
  }
  if (
    s.includes("tier iii") ||
    s.includes("tier 3") ||
    s.includes("tier_3") ||
    s.includes("tier-3") ||
    s.includes("growth")
  ) {
    return "tier_3";
  }
  if (
    s.includes("tier ii") ||
    s.includes("tier 2") ||
    s.includes("tier_2") ||
    s.includes("tier-2") ||
    s.includes("starter")
  ) {
    return "tier_2";
  }
  return "tier_1";
}

/**
 * Resolves the highest subscription tier for a business owner
 */
async function resolveOwnerTier(userId, business) {
  const user = await User.findById(userId);
  const context = await resolveMemberPlanContext(userId);
  const highestTier = context.tierKey;
  const maxRank = context.rank;

  // Admin roles bypass tier restrictions only when no explicit paid subscription tier was configured
  if (
    user &&
    [
      ROLES.CENTRAL_ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.STATE_ADMIN,
      ROLES.CHAPTER_ADMIN,
    ].includes(user.role) &&
    highestTier === "tier_1"
  ) {
    return { tier: "tier_4", rank: 4, isAdmin: true, user };
  }

  return { tier: highestTier, rank: maxRank, isAdmin: false, user };
}

export const branchService = {
  /**
   * Get user's own business
   */
  getBusinessForUser: async (userId) => {
    const business = await Business.findOne({ owner: userId });
    if (!business) {
      throw new NotFoundError(
        "No registered business found for your account. Please create or verify your business first."
      );
    }
    return business;
  },

  /**
   * List all branches owned by the user (including hidden ones)
   */
  getMyBranches: async (userId) => {
    const business = await branchService.getBusinessForUser(userId);
    const branches = await Branch.find({ business: business._id }).sort({
      createdAt: -1,
    });
    const tierInfo = await resolveOwnerTier(userId, business);

    return {
      branches,
      business: {
        id: business._id,
        name: business.name,
        slug: business.slug,
      },
      tierInfo: {
        tier: tierInfo.tier,
        rank: tierInfo.rank,
        maxAllowed:
          tierInfo.tier === "tier_4"
            ? "unlimited"
            : tierInfo.tier === "tier_3"
            ? 1
            : 0,
        currentCount: branches.length,
        canCreate:
          tierInfo.tier === "tier_4" ||
          (tierInfo.tier === "tier_3" && branches.length < 1),
      },
    };
  },

  /**
   * Create a new branch with subscription tier validation
   */
  createBranch: async (userId, data) => {
    const business = await branchService.getBusinessForUser(userId);
    const tierInfo = await resolveOwnerTier(userId, business);

    // Tier 1 and Tier 2 are locked (0 branches)
    if (tierInfo.tier === "tier_1" || tierInfo.tier === "tier_2") {
      throw new ForbiddenError(
        "Branch management is locked on your current plan. Upgrade to Tier III (Growth) for 1 branch or Tier IV (Enterprise) for unlimited branches."
      );
    }

    // Tier 3 is restricted to 1 branch
    if (tierInfo.tier === "tier_3") {
      const existingCount = await Branch.countDocuments({
        business: business._id,
      });
      if (existingCount >= 1) {
        throw new BadRequestError(
          "Your Tier III (Growth) plan allows a maximum of 1 branch. Please upgrade to Tier IV (Enterprise) to add unlimited branches."
        );
      }
    }

    if (!data.name || !data.name.trim()) {
      throw new BadRequestError("Branch name is required.");
    }
    if (!data.city || !data.city.trim()) {
      throw new BadRequestError("City is required.");
    }

    let phone = data.phone ? String(data.phone).trim() : "";
    if (phone) {
      phone = phone.replace(/[^\d+]/g, "");
      if (phone.startsWith("+")) {
        phone = "+" + phone.slice(1).replace(/\+/g, "");
      } else {
        phone = phone.replace(/\+/g, "");
      }
    }

    let pincode = data.pincode ? String(data.pincode).trim() : "";
    if (pincode) {
      pincode = pincode.replace(/\D/g, "").slice(0, 6);
    }

    const branch = await Branch.create({
      business: business._id,
      owner: userId,
      name: data.name.trim(),
      branchType: data.branchType || "Branch Office",
      image: data.image || "",
      contactPerson: data.contactPerson?.trim() || "",
      phone,
      email: data.email?.trim() || "",
      address: data.address?.trim() || "",
      city: data.city.trim(),
      state: data.state?.trim() || business.state || "",
      country: data.country?.trim() || business.country || "India",
      pincode,
      mapUrl: data.mapUrl?.trim() || "",
      timings: data.timings?.trim() || "Mon - Sat: 9:00 AM - 7:00 PM",
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    return branch;
  },

  /**
   * Update an existing branch
   */
  updateBranch: async (userId, branchId, data) => {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found.");
    }

    if (String(branch.owner) !== String(userId)) {
      throw new ForbiddenError("You are not authorized to update this branch.");
    }

    const allowedFields = [
      "name",
      "branchType",
      "image",
      "contactPerson",
      "phone",
      "email",
      "address",
      "city",
      "state",
      "country",
      "pincode",
      "mapUrl",
      "timings",
      "isActive",
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        if (field === "phone") {
          let p = String(data.phone || "").trim();
          p = p.replace(/[^\d+]/g, "");
          if (p.startsWith("+")) {
            p = "+" + p.slice(1).replace(/\+/g, "");
          } else {
            p = p.replace(/\+/g, "");
          }
          branch.phone = p;
        } else if (field === "pincode") {
          branch.pincode = String(data.pincode || "").replace(/\D/g, "").slice(0, 6);
        } else {
          branch[field] = data[field];
        }
      }
    }

    await branch.save();
    return branch;
  },

  /**
   * Toggle visibility (Active vs Hidden)
   */
  toggleVisibility: async (userId, branchId) => {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found.");
    }

    if (String(branch.owner) !== String(userId)) {
      throw new ForbiddenError("You are not authorized to modify this branch.");
    }

    branch.isActive = !branch.isActive;
    await branch.save();

    return {
      branch,
      message: branch.isActive
        ? "Branch is now visible on your public profile."
        : "Branch has been hidden from your public profile.",
    };
  },

  /**
   * Delete a branch
   */
  deleteBranch: async (userId, branchId) => {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      throw new NotFoundError("Branch not found.");
    }

    if (String(branch.owner) !== String(userId)) {
      throw new ForbiddenError("You are not authorized to delete this branch.");
    }

    await Branch.findByIdAndDelete(branchId);
    return { message: "Branch deleted successfully." };
  },

  /**
   * Get public active branches for a business (accessible by anyone)
   */
  getPublicBranches: async (businessIdOrSlug) => {
    let business = null;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(businessIdOrSlug);

    if (isObjectId) {
      business = await Business.findById(businessIdOrSlug);
    }
    if (!business) {
      business = await Business.findOne({ slug: businessIdOrSlug });
    }
    if (!business) {
      return [];
    }

    const branches = await Branch.find({
      business: business._id,
      isActive: true,
    }).sort({ createdAt: 1 });

    return branches;
  },

  /**
   * Upload image for branch storefront / office photo
   */
  uploadBranchImage: async (file) => {
    if (!file) throw new BadRequestError("No image file provided");
    const fileUrl = await storageService.uploadFile(file, "branches");
    let dataUrl = "";
    if (file.buffer) {
      const mime = file.mimetype || "image/png";
      dataUrl = `data:${mime};base64,${file.buffer.toString("base64")}`;
    }
    return { url: fileUrl, dataUrl };
  },
};

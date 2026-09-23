import { Business } from "../businesses/business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { User } from "../users/user.model.js";
import { StateProfile } from "../states/state-profile.model.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/errors.js";

/**
 * Formats state name to standard Title Case and strips invalid values
 */
export const formatStateName = (state) => {
  if (!state || typeof state !== "string") return "";
  const trimmed = state.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "unassigned" ||
    trimmed.toLowerCase() === "unknown" ||
    trimmed.toLowerCase() === "null" ||
    trimmed.toLowerCase() === "undefined"
  ) {
    return "";
  }
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Dynamically resolves state from Database collections (Chapters, Businesses, StateProfiles)
 * 100% Dynamic — No hardcoded static arrays or maps.
 */
export const resolveStateFromCity = async (city) => {
  if (!city || typeof city !== "string") return "";
  const cleanCity = city.trim();
  if (!cleanCity || cleanCity.toLowerCase() === "unassigned") return "";

  try {
    const escaped = cleanCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1. Check Chapters collection dynamically by Chapter city
    const chapterByCity = await Chapter.findOne({
      city: new RegExp(`^${escaped}$`, "i"),
      state: { $nin: ["Unassigned", "unassigned", "", null] },
    }).select("state");
    if (chapterByCity?.state) {
      return formatStateName(chapterByCity.state);
    }

    // 2. Check Chapters collection dynamically by Chapter name (e.g. "Navi Mumbai Chapter", "Delhi Chapter")
    const chapterByName = await Chapter.findOne({
      name: new RegExp(escaped, "i"),
      state: { $nin: ["Unassigned", "unassigned", "", null] },
    }).select("state");
    if (chapterByName?.state) {
      return formatStateName(chapterByName.state);
    }

    // 3. Check other verified/active businesses in the same city dynamically
    const otherBiz = await Business.findOne({
      city: new RegExp(`^${escaped}$`, "i"),
      state: { $nin: ["Unassigned", "unassigned", "", null] },
    }).select("state");
    if (otherBiz?.state) {
      return formatStateName(otherBiz.state);
    }

    // 4. Check if the string matches any StateProfile directly in database
    const stateProfile = await StateProfile.findOne({
      name: new RegExp(`^${escaped}$`, "i"),
    }).select("name");
    if (stateProfile?.name) {
      return formatStateName(stateProfile.name);
    }
  } catch (err) {
    // Non-blocking database query error
  }

  return "";
};

/**
 * 100% Dynamic resolution of a business's state from Database relations
 */
export const resolveBusinessState = async (business) => {
  if (!business) return "";
  let resolved = formatStateName(business.state);
  if (resolved) return resolved;

  // 1. Try from chapterId dynamically
  if (business.chapterId) {
    const chapter = await Chapter.findById(business.chapterId).select("name state");
    if (chapter?.state) {
      resolved = formatStateName(chapter.state);
      if (resolved) {
        business.state = resolved;
        await business.save().catch(() => {});
        return resolved;
      }
    }
  }

  // 2. Try from city dynamically from DB
  if (business.city) {
    const fromCity = await resolveStateFromCity(business.city);
    if (fromCity) {
      business.state = fromCity;
      await business.save().catch(() => {});
      return fromCity;
    }
  }

  // 3. Try from owner User dynamically
  if (business.owner) {
    const user = await User.findById(business.owner).select("state chapterId");
    if (user?.state) {
      resolved = formatStateName(user.state);
      if (resolved) {
        business.state = resolved;
        await business.save().catch(() => {});
        return resolved;
      }
    }
    if (user?.chapterId && !business.chapterId) {
      const chapter = await Chapter.findById(user.chapterId).select("state");
      if (chapter?.state) {
        resolved = formatStateName(chapter.state);
        if (resolved) {
          business.chapterId = user.chapterId;
          business.state = resolved;
          await business.save().catch(() => {});
          return resolved;
        }
      }
    }
  }

  return "";
};

/**
 * Resolves the calling user's own business profile, required to log any
 * networking record (a one-to-one meeting or a thank-you note).
 */
export const resolveOwnBusiness = async (userId) => {
  const business = await Business.findOne({ owner: userId });
  if (!business) {
    throw new BadRequestError("You must have a registered business profile to use Networking features.");
  }
  const resolvedState = await resolveBusinessState(business);
  if (!business.chapterId || !resolvedState) {
    if (!business.chapterId) {
      const user = await User.findById(userId).select("chapterId");
      if (user?.chapterId) {
        business.chapterId = user.chapterId;
        await business.save().catch(() => {});
      }
    }
  }
  return business;
};

/**
 * Resolves the selected fellow member's business profile.
 */
export const resolveMemberBusiness = async (businessId) => {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new NotFoundError("Selected member's business could not be found.");
  }
  await resolveBusinessState(business);
  return business;
};

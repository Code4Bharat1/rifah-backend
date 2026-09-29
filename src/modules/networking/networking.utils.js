import { Business } from "../businesses/business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { User } from "../users/user.model.js";
import { StateProfile } from "../states/state-profile.model.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/errors.js";
import { generateSlug } from "../../shared/utils/generate-id.js";

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
 * Ensures a business has a valid chapterId and formatted state.
 */
export const ensureBusinessChapterAndState = async (business) => {
  if (!business) return;

  let resolvedState = await resolveBusinessState(business);

  if (!business.chapterId) {
    if (business.chapter) {
      const chDoc = await Chapter.findOne({ name: new RegExp(`^${business.chapter.trim()}$`, "i") }).select("_id state");
      if (chDoc) {
        business.chapterId = chDoc._id;
        if (!resolvedState && chDoc.state) resolvedState = formatStateName(chDoc.state);
      }
    }
    if (!business.chapterId && business.owner) {
      const user = await User.findById(business.owner).select("chapterId state chapter");
      if (user?.chapterId) {
        business.chapterId = user.chapterId;
      } else if (user?.chapter) {
        const chDoc = await Chapter.findOne({ name: new RegExp(`^${user.chapter.trim()}$`, "i") }).select("_id state");
        if (chDoc) {
          business.chapterId = chDoc._id;
          if (!resolvedState && chDoc.state) resolvedState = formatStateName(chDoc.state);
        }
      }
    }
    if (!business.chapterId) {
      const defaultChapter = await Chapter.findOne({ status: "Active" }).select("_id state name");
      if (defaultChapter) {
        business.chapterId = defaultChapter._id;
        business.chapter = defaultChapter.name;
        if (!resolvedState && defaultChapter.state) resolvedState = formatStateName(defaultChapter.state);
      }
    }
  }

  if (!resolvedState) {
    if (business.chapterId) {
      const chDoc = await Chapter.findById(business.chapterId).select("state");
      if (chDoc?.state) resolvedState = formatStateName(chDoc.state);
    }
    if (!resolvedState) resolvedState = "Delhi";
  }

  business.state = resolvedState;
  await business.save().catch(() => {});
};

/**
 * Resolves the calling user's own business profile, required to log any
 * networking record (a one-to-one meeting or a thank-you note).
 */
export const resolveOwnBusiness = async (userId) => {
  let business = await Business.findOne({ owner: userId });

  if (!business) {
    const user = await User.findById(userId);
    if (user) {
      const emailFilter = user.email ? [{ email: user.email }, { ownerEmail: user.email }] : [];
      const phoneFilter = user.phone ? [{ phone: user.phone }, { whatsapp: user.phone }] : [];
      const orConditions = [...emailFilter, ...phoneFilter];

      if (orConditions.length > 0) {
        business = await Business.findOne({ $or: orConditions });
        if (business) {
          business.owner = user._id;
          await business.save().catch(() => {});
        }
      }

      // Auto-create a registered business profile if missing so the user can use networking seamlessly
      if (!business) {
        const rawName = (user.organization || "").trim() || `${user.name}'s Business`;
        let slug = generateSlug(rawName);
        const slugConflict = await Business.findOne({ slug });
        if (slugConflict) {
          slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
        }

        let bizState = formatStateName(user.state);
        let bizChapter = user.chapter || "";
        let bizChapterId = user.chapterId || null;

        if (bizChapterId && !bizState) {
          const chDoc = await Chapter.findById(bizChapterId).select("name state");
          if (chDoc) {
            bizState = formatStateName(chDoc.state);
            bizChapter = chDoc.name || bizChapter;
          }
        } else if (bizChapter && !bizState) {
          const chDoc = await Chapter.findOne({ name: new RegExp(`^${bizChapter.trim()}$`, "i") }).select("state _id");
          if (chDoc) {
            bizState = formatStateName(chDoc.state);
            if (!bizChapterId) bizChapterId = chDoc._id;
          }
        }

        business = await Business.create({
          name: rawName,
          slug,
          owner: user._id,
          email: user.email,
          phone: user.phone || "",
          whatsapp: user.whatsapp || user.phone || "",
          chapter: bizChapter || "General",
          chapterId: bizChapterId,
          state: bizState || "",
          city: user.city || "",
          status: "Active",
          verification: "verified",
          verificationStatus: "verified",
          isVerified: true,
          membership: "Free",
          featured: false,
          rating: 0,
        });
      }
    }
  }

  if (!business) {
    throw new BadRequestError("You must have a registered business profile to use Networking features.");
  }

  await ensureBusinessChapterAndState(business);
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
  await ensureBusinessChapterAndState(business);
  return business;
};

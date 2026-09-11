import { Business } from "../../modules/businesses/business.model.js";
import { Chapter } from "../../modules/chapters/chapter.model.js";
import { ROLES } from "../constants/roles.js";

/**
 * Generates a MongoDB query filter to restrict access based on the user's chapter.
 * @param {Object} user - The authenticated user object (from req.user).
 * @param {string} entityType - 'direct' (legacy free-text `chapter` name field),
 *   'direct_id' (has a real `chapterId` field, e.g. Business/User/Enquiry), or
 *   'business_ref' (has a `business` reference; matched via Business.chapterId).
 * @returns {Promise<Object>} MongoDB filter object to spread into queries.
 */
export const getChapterFilter = async (user, entityType = "direct") => {
  if (!user || !user.role) return {};

  // Super Admins and Secretariat have unrestricted access
  if ([ROLES.SUPER_ADMIN, ROLES.SECRETARIAT].includes(user.role)) {
    return {};
  }

  // Only Chapter Admins are restricted by this specific chapter filter logic
  if (user.role !== ROLES.CHAPTER_ADMIN) {
    return {};
  }

  let resolvedChapterId = user.chapterId;
  if (!resolvedChapterId && user.chapter) {
    resolvedChapterId = await resolveChapterIdByName(user.chapter);
  }

  const baseCity = user.chapter ? user.chapter.replace(/\b(chapter|chamber)\b/gi, "").trim() : "";
  const chapterRegex = baseCity ? new RegExp(baseCity, "i") : null;

  if (entityType === "direct_id") {
    const conditions = [];
    if (resolvedChapterId) conditions.push({ chapterId: resolvedChapterId });
    if (chapterRegex) conditions.push({ chapter: chapterRegex });
    if (conditions.length === 0) return { _id: null };
    return conditions.length === 1 ? conditions[0] : { $or: conditions };
  }

  if (entityType === "business_ref") {
    const conditions = [];
    if (resolvedChapterId) conditions.push({ chapterId: resolvedChapterId });
    if (chapterRegex) conditions.push({ chapter: chapterRegex });
    if (conditions.length === 0) return { _id: null };
    const businesses = await Business.find(conditions.length === 1 ? conditions[0] : { $or: conditions }).select("_id");
    const businessIds = businesses.map((b) => b._id);
    return { business: { $in: businessIds } };
  }

  // Legacy 'direct': models that only carry the free-text `chapter` name (e.g. Announcement, Event)
  if (!chapterRegex) {
    return { _id: null };
  }
  return { chapter: chapterRegex };
};

/**
 * Resolves a Chapter's id by exact-ish name match (used when a user/business explicitly
 * picks a chapter by name, e.g. at registration).
 * @param {string} chapterName
 * @returns {Promise<import("mongoose").Types.ObjectId|null>}
 */
export const resolveChapterIdByName = async (chapterName) => {
  if (!chapterName || typeof chapterName !== "string" || !chapterName.trim()) {
    return null;
  }
  const needle = chapterName.trim().toLowerCase();
  const chapters = await Chapter.find({}).select("_id name");
  const match = chapters.find((c) => (c.name || "").trim().toLowerCase() === needle);
  return match ? match._id : null;
};

// Common alternate/former names for Indian cities, so "Bangalore" still matches a
// chapter whose city is recorded as "Bengaluru", etc.
const CITY_ALIASES = {
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
  madras: "chennai",
  poona: "pune",
  baroda: "vadodara",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
  mysore: "mysuru",
  gurgaon: "gurugram",
};

const normalizeCityToken = (value) => {
  const clean = (value || "").trim().toLowerCase();
  return CITY_ALIASES[clean] || clean;
};

/**
 * Resolves a Chapter by matching free-text buyer location against the chapter's city
 * (falling back to state). Matching is done in JS (not via a regex built from user input,
 * which would be both unsafe and directionally wrong for phrases like "Andheri, Mumbai").
 * Returns the chapterId, or null if nothing matches.
 * @param {string} locationText
 * @returns {Promise<import("mongoose").Types.ObjectId|null>}
 */
export const resolveChapterIdForLocation = async (locationText) => {
  if (!locationText || typeof locationText !== "string" || !locationText.trim()) {
    return null;
  }

  const needle = normalizeCityToken(locationText);
  if (!needle) return null;

  const chapters = await Chapter.find({}).select("_id city state");

  const byCity = chapters.find((c) => {
    const city = normalizeCityToken(c.city);
    return city && (needle.includes(city) || city.includes(needle));
  });
  if (byCity) return byCity._id;

  const byState = chapters.find((c) => {
    const state = normalizeCityToken(c.state);
    return state && (needle.includes(state) || state.includes(needle));
  });
  return byState ? byState._id : null;
};

/**
 * Enforces chapter scope on request body for CREATE operations.
 * Overwrites any client-provided chapter with the authenticated admin's chapter.
 * @param {Object} req - The Express request object.
 */
export const enforceBodyChapterScope = (req) => {
  if (req.user && req.user.role === ROLES.CHAPTER_ADMIN && req.user.chapter) {
    req.body.chapter = req.user.chapter;
    if (req.user.chapterId) {
      req.body.chapterId = req.user.chapterId;
    }
  }
};

/**
 * Enforces chapter scope on request body for UPDATE operations.
 * Prevents Chapter Admins from modifying the chapter field.
 * @param {Object} req - The Express request object.
 */
export const preventChapterModification = (req) => {
  if (req.user && req.user.role === ROLES.CHAPTER_ADMIN) {
    delete req.body.chapter;
    delete req.body.chapterId;
  }
};

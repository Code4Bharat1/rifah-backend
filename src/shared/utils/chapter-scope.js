import { Business } from "../../modules/businesses/business.model.js";
import { ROLES } from "../constants/roles.js";

/**
 * Generates a MongoDB query filter to restrict access based on the user's chapter.
 * @param {Object} user - The authenticated user object (from req.user).
 * @param {string} entityType - 'direct' (has chapter field) or 'business_ref' (has business reference).
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

  // If Chapter Admin doesn't have a chapter assigned, deny access to everything to be safe
  if (!user.chapter) {
    return { _id: null }; 
  }

  // Use case-insensitive regex to handle inconsistencies like "Mumbai Chapter" vs "mumbai chapter"
  const chapterRegex = new RegExp(`^${user.chapter.trim()}$`, "i");

  if (entityType === "direct") {
    return { chapter: chapterRegex };
  }

  if (entityType === "business_ref") {
    const businesses = await Business.find({ chapter: chapterRegex }).select("_id");
    const businessIds = businesses.map((b) => b._id);
    return { business: { $in: businessIds } };
  }

  return {};
};

/**
 * Enforces chapter scope on request body for CREATE operations.
 * Overwrites any client-provided chapter with the authenticated admin's chapter.
 * @param {Object} req - The Express request object.
 */
export const enforceBodyChapterScope = (req) => {
  if (req.user && req.user.role === ROLES.CHAPTER_ADMIN && req.user.chapter) {
    req.body.chapter = req.user.chapter;
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
  }
};

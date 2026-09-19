import { Course } from "./course.model.js";
import { CourseProgress } from "./courseProgress.model.js";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { NotFoundError, ForbiddenError } from "../../shared/errors/errors.js";

/**
 * Creates a new course
 */
export const createCourse = async (courseData, user) => {
  const scope = getScopeFromRole(user.role);
  
  const course = new Course({
    ...courseData,
    createdBy: user.id || user._id,
    scope,
    state: scope === 'state' ? (user.state || user.stateId) : null,
    chapterId: scope === 'chapter' ? (user.chapterId || user.chapter) : null,
  });

  return await course.save();
};

/**
 * Updates an existing course
 */
export const updateCourse = async (courseId, courseData, user) => {
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  if (!canManageCourse(user, course)) {
    throw new ForbiddenError("You don't have permission to modify this course");
  }

  // Prevent tampering with scope or target bindings via update
  const safeData = { ...courseData };
  delete safeData.scope;
  delete safeData.state;
  delete safeData.chapterId;
  delete safeData.createdBy;

  Object.assign(course, safeData);
  return await course.save();
};

/**
 * Deletes a course
 */
export const deleteCourse = async (courseId, user) => {
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  if (!canManageCourse(user, course)) {
    throw new ForbiddenError("You don't have permission to delete this course");
  }

  await Course.findByIdAndDelete(courseId);
  await CourseProgress.deleteMany({ courseId });
  return true;
};

/**
 * Gets courses based on user role and visibility rules
 */
export const getCourses = async (user, query = {}) => {
  let filter = { ...query };

  // Admins only see and manage their OWN scope's courses in their respective panel
  if (user.role === ROLES.CENTRAL_ADMIN) {
    // Central Admin only manages Centre courses in their panel
    filter.scope = 'centre';
  } else if (user.role === ROLES.STATE_ADMIN) {
    // State Admin only manages courses for their own state
    filter.scope = 'state';
    filter.state = user.state || user.stateId;
  } else if (user.role === ROLES.CHAPTER_ADMIN) {
    // Chapter Admin only manages courses for their own chapter
    filter.scope = 'chapter';
    filter.chapterId = user.chapterId || user.chapter;
  } else if (user.role === ROLES.BUSINESS_OWNER) {
    // Business owners see all courses targeted at them: Centre + their State + their Chapter
    filter.isActive = true;
    
    let business = user.business;
    if (!business && (user.businessId || user.id)) {
      business = await Business.findOne(user.businessId ? { _id: user.businessId } : { owner: user.id });
    }

    const state = business?.state || user.state || user.stateId;
    const chapterId = business?.chapterId || user.chapterId || user.chapter;

    const orConditions = [{ scope: 'centre' }];
    if (state) orConditions.push({ scope: 'state', state });
    if (chapterId) orConditions.push({ scope: 'chapter', chapterId });
    filter.$or = orConditions;
  } else {
     return [];
  }

  const courses = await Course.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'firstName lastName').lean();

  if (user.role === ROLES.BUSINESS_OWNER) {
    let businessId = user.business?._id || user.businessId;
    if (!businessId && user.id) {
      const biz = await Business.findOne({ owner: user.id }).select('_id');
      businessId = biz?._id;
    }

    if (businessId && courses.length > 0) {
      const courseIds = courses.map(c => c._id);
      const [progressDocs, certDocs] = await Promise.all([
        CourseProgress.find({ businessId, courseId: { $in: courseIds } }).lean(),
        Certificate.find({ businessId, courseId: { $in: courseIds } }).lean(),
      ]);

      const progressMap = new Map(progressDocs.map(p => [String(p.courseId), p]));
      const certMap = new Map(certDocs.map(c => [String(c.courseId), c]));

      return courses.map(c => ({
        ...c,
        progress: progressMap.get(String(c._id)) || null,
        certificate: certMap.get(String(c._id)) || null,
      }));
    }
  }

  return courses;
};

/**
 * Gets a single course if user has access
 */
export const getCourseById = async (courseId, user) => {
  const course = await Course.findById(courseId).populate('createdBy', 'firstName lastName');
  if (!course) throw new NotFoundError("Course not found");
  
  if (user.role !== ROLES.CENTRAL_ADMIN && !course.isActive) {
      if (!canManageCourse(user, course)) {
          throw new ForbiddenError("Course is not available");
      }
  }

  // Check business owner access
  if (user.role === ROLES.BUSINESS_OWNER) {
    let business = user.business;
    if (!business && (user.businessId || user.id)) {
      business = await Business.findOne(user.businessId ? { _id: user.businessId } : { owner: user.id });
    }

    const state = business?.state || user.state || user.stateId;
    const chapterId = business?.chapterId || user.chapterId || user.chapter;

    const canAccess = course.scope === 'centre' || 
                      (course.scope === 'state' && course.state === state) ||
                      (course.scope === 'chapter' && String(course.chapterId) === String(chapterId));
    
    if (!canAccess) throw new ForbiddenError("You do not have access to this course");
  } else if (!canManageCourse(user, course) && user.role !== ROLES.CENTRAL_ADMIN) {
     throw new ForbiddenError("You do not have access to this course");
  }

  return course;
};


// Helpers
const getScopeFromRole = (role) => {
  if (role === ROLES.CENTRAL_ADMIN) return 'centre';
  if (role === ROLES.STATE_ADMIN) return 'state';
  if (role === ROLES.CHAPTER_ADMIN) return 'chapter';
  return 'centre'; // fallback
};

const canManageCourse = (user, course) => {
  if (user.role === ROLES.CENTRAL_ADMIN) return true;
  if (user.role === ROLES.STATE_ADMIN) {
    const userState = user.state || user.stateId;
    return course.scope === 'state' && course.state === userState;
  }
  if (user.role === ROLES.CHAPTER_ADMIN) {
    const userChapter = user.chapterId || user.chapter;
    return course.scope === 'chapter' && String(course.chapterId) === String(userChapter);
  }
  return false;
};


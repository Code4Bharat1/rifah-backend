import { Course } from "./course.model.js";
import { CourseProgress } from "./courseProgress.model.js";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";

/**
 * Creates a new course
 */
export const createCourse = async (courseData, user) => {
  if (!courseData.title || !String(courseData.title).trim()) {
    throw new BadRequestError("Course title is required");
  }
  if (String(courseData.title).trim().length < 3) {
    throw new BadRequestError("Course title must be at least 3 characters long");
  }
  if (!courseData.description || !String(courseData.description).trim()) {
    throw new BadRequestError("Course description is required");
  }
  if (String(courseData.description).trim().length < 10) {
    throw new BadRequestError("Course description must be at least 10 characters long");
  }
  const categoryStr = String(courseData.category || "").trim();
  if (!categoryStr) {
    throw new BadRequestError("Category is required");
  }
  const normalizedCategory = categoryStr === "all" || categoryStr.toLowerCase() === "all categories" ? "All Categories" : categoryStr;

  const subcategoryStr = String(courseData.subcategory || "").trim();
  const normalizedSubcategory = subcategoryStr && subcategoryStr !== "all" ? subcategoryStr : "";

  const isPublishing = courseData.isActive === true || courseData.status === "published";
  const totalLessons = (courseData.chapters || []).reduce((acc, ch) => acc + (ch.contents?.length || 0), 0) + (courseData.contents?.length || 0);

  if (isPublishing && totalLessons === 0) {
    throw new BadRequestError("Cannot publish an empty course. Please attach at least 1 video or PDF lesson.");
  }

  const scope = getScopeFromRole(user.role);
  
  let businessId = null;
  if (user.role === ROLES.BUSINESS_OWNER) {
    businessId = user.businessId || user.business?._id;
    if (!businessId && (user.id || user._id)) {
      const biz = await Business.findOne({ owner: user.id || user._id }).select('_id');
      businessId = biz?._id || null;
    }
  }

  const course = new Course({
    ...courseData,
    title: String(courseData.title).trim(),
    description: courseData.description ? String(courseData.description).trim() : "",
    category: normalizedCategory,
    subcategory: normalizedSubcategory,
    createdBy: user.id || user._id,
    businessId,
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

  if (courseData.title !== undefined) {
    if (!String(courseData.title).trim()) {
      throw new BadRequestError("Course title cannot be empty");
    }
    if (String(courseData.title).trim().length < 3) {
      throw new BadRequestError("Course title must be at least 3 characters long");
    }
  }

  if (courseData.category !== undefined) {
    const catStr = String(courseData.category).trim();
    if (!catStr) {
      throw new BadRequestError("Category is required");
    }
  }

  if (courseData.description !== undefined && !String(courseData.description).trim()) {
    throw new BadRequestError("Course description cannot be empty");
  }

  const safeData = { ...courseData };
  if (safeData.title !== undefined) safeData.title = String(safeData.title).trim();
  if (safeData.description !== undefined) safeData.description = String(safeData.description).trim();
  if (safeData.category !== undefined) {
    const catStr = String(safeData.category).trim();
    safeData.category = catStr === "all" || catStr.toLowerCase() === "all categories" ? "All Categories" : catStr;
  }
  if (safeData.subcategory !== undefined) {
    const subStr = String(safeData.subcategory).trim();
    safeData.subcategory = subStr && subStr !== "all" ? subStr : "";
  }
  delete safeData.scope;
  delete safeData.state;
  delete safeData.chapterId;
  delete safeData.createdBy;
  delete safeData.businessId;

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

  // Support fetching strictly own created courses (for Business / Admin Creator Studio)
  if (query.myCourses === 'true' || query.creator === 'me') {
    const myFilter = { createdBy: user.id || user._id };
    if (query.category && query.category !== 'all') {
      myFilter.category = query.category;
    }
    if (query.subcategory && query.subcategory !== 'all') {
      myFilter.subcategory = query.subcategory;
    }
    return await Course.find(myFilter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .populate('businessId', 'name logo slug')
      .lean();
  }

  delete filter.myCourses;
  delete filter.creator;

  // Handle category / subcategory filters if provided
  if (filter.category === 'all' || !filter.category) {
    delete filter.category;
  } else {
    // When filtering by a specific category, also surface universal "All Categories" courses
    filter.category = { $in: [filter.category, 'All Categories'] };
  }
  if (filter.subcategory === 'all' || !filter.subcategory) {
    delete filter.subcategory;
  }

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
    // Business owners see all courses targeted at them: Centre + their State + their Chapter + peer Business courses
    filter.isActive = true;
    
    let business = user.business;
    if (!business && (user.businessId || user.id)) {
      business = await Business.findOne(user.businessId ? { _id: user.businessId } : { owner: user.id });
    }

    const state = business?.state || user.state || user.stateId;
    const chapterId = business?.chapterId || user.chapterId || user.chapter;

    const orConditions = [
      { scope: 'centre' },
      { scope: 'business' }
    ];
    if (state) orConditions.push({ scope: 'state', state });
    if (chapterId) orConditions.push({ scope: 'chapter', chapterId });
    filter.$or = orConditions;
  } else {
     return [];
  }

  const courses = await Course.find(filter)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')
    .populate('businessId', 'name logo slug')
    .lean();

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
  const course = await Course.findById(courseId)
    .populate('createdBy', 'name email')
    .populate('businessId', 'name logo slug');
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
                      course.scope === 'business' ||
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
  if (role === ROLES.BUSINESS_OWNER) return 'business';
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
  if (user.role === ROLES.BUSINESS_OWNER) {
    const userId = user.id || user._id;
    const creatorId = course.createdBy?._id || course.createdBy;
    return String(creatorId) === String(userId);
  }
  return false;
};


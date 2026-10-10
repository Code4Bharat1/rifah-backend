import { Course } from "./course.model.js";
import { CourseProgress } from "./courseProgress.model.js";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { User } from "../users/user.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";
import { notificationService } from "../notifications/notification.service.js";

/**
 * Creates a new course
 */
export const createCourse = async (courseData, user) => {
  // BUG-062: LMS course creation is Central Admin exclusive now — State, Chapter and
  // Business accounts can no longer submit courses at all (the route already enforces
  // this via requireRole; this guard is defense-in-depth so the rule holds even if this
  // service function is ever called from somewhere else).
  if (user.role !== ROLES.CENTRAL_ADMIN) {
    throw new ForbiddenError("Only Central Admin can create and publish courses");
  }

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

  // Every course is now a Central Admin course — scope stays 'centre' and the approval
  // workflow is skipped entirely (not just unused: there is no other creator left who
  // would ever need it).
  const scope = 'centre';

  let isPaid = Boolean(courseData.isPaid);
  let price = 0;
  if (isPaid) {
    const parsedPrice = Number(courseData.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      throw new BadRequestError("Paid courses must have a valid price greater than ₹0");
    }
    price = Math.round(parsedPrice);
  }

  const course = new Course({
    ...courseData,
    title: String(courseData.title).trim(),
    description: courseData.description ? String(courseData.description).trim() : "",
    category: normalizedCategory,
    subcategory: normalizedSubcategory,
    createdBy: user.id || user._id,
    businessId: null,
    scope,
    state: null,
    chapterId: null,
    isPaid,
    price,
    approvalStatus: "not_required",
    isActive: Boolean(courseData.isActive === true || courseData.status === "published"),
    approvedBy: user.id || user._id,
    approvedAt: new Date(),
    enrollments: [],
  });

  const saved = await course.save();

  return saved;
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

  // BUG-062: canManageCourse now only ever returns true for Central Admin, so everything
  // past the guard above is already guaranteed to be Central Admin — the old non-central
  // branch (which stripped isPaid/price and enforced the approval workflow) is gone.
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

  if (safeData.isPaid !== undefined) {
    safeData.isPaid = Boolean(safeData.isPaid);
    if (safeData.isPaid) {
      const parsedPrice = Number(safeData.price ?? course.price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        throw new BadRequestError("Paid courses must have a valid price greater than ₹0");
      }
      safeData.price = Math.round(parsedPrice);
    } else {
      safeData.price = 0;
    }
  } else if (course.isPaid && safeData.price !== undefined) {
    const parsedPrice = Number(safeData.price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      throw new BadRequestError("Paid courses must have a valid price greater than ₹0");
    }
    safeData.price = Math.round(parsedPrice);
  }

  Object.assign(course, safeData);
  return await course.save();
};

/**
 * Approves a course (Central Admin only)
 */
export const approveCourse = async (courseId, user) => {
  if (user.role !== ROLES.CENTRAL_ADMIN) {
    throw new ForbiddenError("Only Central Admin can approve courses");
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  course.approvalStatus = "approved";
  course.approvedBy = user.id || user._id;
  course.approvedAt = new Date();
  course.approvalRemark = "";
  course.isActive = true;

  const saved = await course.save();

  if (course.createdBy) {
    setImmediate(async () => {
      try {
        const creatorUser = await User.findById(course.createdBy).select("role");
        let link = "/biz/lms";
        if (creatorUser?.role === ROLES.CHAPTER_ADMIN) link = "/chapter-admin/lms";
        else if (creatorUser?.role === ROLES.STATE_ADMIN) link = "/state-admin/lms";

        await notificationService.createNotification({
          recipientId: course.createdBy,
          type: "System",
          title: "Course Approved & Published",
          body: `Your course "${course.title}" has been approved by Central Admin and is now live!`,
          link,
        });
      } catch (e) {}
    });
  }

  return saved;
};

/**
 * Rejects a course (Central Admin only)
 */
export const rejectCourse = async (courseId, remark, user) => {
  if (user.role !== ROLES.CENTRAL_ADMIN) {
    throw new ForbiddenError("Only Central Admin can reject courses");
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  course.approvalStatus = "rejected";
  course.approvalRemark = String(remark || "").trim() || "Course did not meet quality guidelines.";
  course.isActive = false;

  const saved = await course.save();

  if (course.createdBy) {
    setImmediate(async () => {
      try {
        const creatorUser = await User.findById(course.createdBy).select("role");
        let link = "/biz/lms";
        if (creatorUser?.role === ROLES.CHAPTER_ADMIN) link = "/chapter-admin/lms";
        else if (creatorUser?.role === ROLES.STATE_ADMIN) link = "/state-admin/lms";

        await notificationService.createNotification({
          recipientId: course.createdBy,
          type: "System",
          title: "Course Submission Rejected",
          body: `Your course "${course.title}" was not approved: ${course.approvalRemark}`,
          link,
        });
      } catch (e) {}
    });
  }

  return saved;
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
      .populate('createdBy', 'name email role')
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

  const isCentralAdmin = user.role === ROLES.CENTRAL_ADMIN;

  // Central Admin can review all courses or filter by scope and approval status
  if (isCentralAdmin) {
    if (query.scope && query.scope !== 'all' && query.scope !== 'all_scopes') {
      filter.scope = query.scope;
    } else {
      delete filter.scope;
    }
    if (query.approvalStatus && query.approvalStatus !== 'all') {
      filter.approvalStatus = query.approvalStatus;
    }
  } else if (user.role === ROLES.STATE_ADMIN) {
    // State Admin only manages courses for their own state
    filter.scope = 'state';
    filter.state = user.state || user.stateId;
    if (query.approvalStatus && query.approvalStatus !== 'all') {
      filter.approvalStatus = query.approvalStatus;
    }
  } else if (user.role === ROLES.CHAPTER_ADMIN) {
    // Chapter Admin only manages courses for their own chapter
    filter.scope = 'chapter';
    filter.chapterId = user.chapterId || user.chapter;
    if (query.approvalStatus && query.approvalStatus !== 'all') {
      filter.approvalStatus = query.approvalStatus;
    }
  } else if (user.role === ROLES.BUSINESS_OWNER || user.role === ROLES.CUSTOMER || user.role === ROLES.BUYER) {
    // Business owners and members see active approved courses targeted at them
    filter.isActive = true;
    filter.approvalStatus = { $in: ["approved", "not_required"] };
    
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
    .populate('createdBy', 'name email role')
    .populate('businessId', 'name logo slug')
    .populate('approvedBy', 'name email')
    .lean();

  if (user.role === ROLES.BUSINESS_OWNER || user.role === ROLES.CUSTOMER || user.role === ROLES.BUYER) {
    let businessId = user.business?._id || user.businessId;
    if (!businessId && user.id) {
      const biz = await Business.findOne({ owner: user.id }).select('_id');
      businessId = biz?._id;
    }

    const userIdStr = String(user.id || user._id);
    const bizIdStr = businessId ? String(businessId) : null;

    let progressDocs = [];
    let certDocs = [];

    if (courses.length > 0 && businessId) {
      const courseIds = courses.map(c => c._id);
      [progressDocs, certDocs] = await Promise.all([
        CourseProgress.find({ businessId, courseId: { $in: courseIds } }).lean(),
        Certificate.find({ businessId, courseId: { $in: courseIds } }).lean(),
      ]);
    }

    const progressMap = new Map(progressDocs.map(p => [String(p.courseId), p]));
    const certMap = new Map(certDocs.map(c => [String(c.courseId), c]));

    return courses.map(c => {
      const isEnrolled = !c.isPaid || (Array.isArray(c.enrollments) && c.enrollments.some(e => 
        String(e.userId) === userIdStr || (bizIdStr && String(e.businessId) === bizIdStr)
      ));

      return {
        ...c,
        isEnrolled,
        enrollmentCount: c.enrollments?.length || 0,
        progress: progressMap.get(String(c._id)) || null,
        certificate: certMap.get(String(c._id)) || null,
      };
    });
  }

  return courses;
};

/**
 * Gets a single course if user has access
 */
export const getCourseById = async (courseId, user) => {
  const course = await Course.findById(courseId)
    .populate('createdBy', 'name email role')
    .populate('businessId', 'name logo slug')
    .populate('approvedBy', 'name email');
  if (!course) throw new NotFoundError("Course not found");
  
  if (user.role !== ROLES.CENTRAL_ADMIN && !course.isActive) {
      if (!canManageCourse(user, course)) {
          throw new ForbiddenError("Course is not available or pending approval");
      }
  }

  const isCentralAdmin = user.role === ROLES.CENTRAL_ADMIN;
  const isCreator = String(course.createdBy?._id || course.createdBy) === String(user.id || user._id);

  let isEnrolled = !course.isPaid || isCentralAdmin || isCreator;

  // Check business owner or customer access
  if (user.role === ROLES.BUSINESS_OWNER || user.role === ROLES.CUSTOMER || user.role === ROLES.BUYER) {
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

    const userIdStr = String(user.id || user._id);
    const bizIdStr = business?._id ? String(business._id) : null;
    isEnrolled = !course.isPaid || isCreator || (Array.isArray(course.enrollments) && course.enrollments.some(e => 
      String(e.userId) === userIdStr || (bizIdStr && String(e.businessId) === bizIdStr)
    ));
  } else if (!canManageCourse(user, course) && !isCentralAdmin) {
     throw new ForbiddenError("You do not have access to this course");
  }

  const courseObj = course.toObject ? course.toObject() : { ...course };
  courseObj.isEnrolled = isEnrolled;
  courseObj.enrollmentCount = course.enrollments?.length || 0;

  // If paid and user has NOT enrolled, mask lesson media URLs so they cannot be accessed without paying
  if (course.isPaid && !isEnrolled) {
    if (Array.isArray(courseObj.chapters)) {
      courseObj.chapters = courseObj.chapters.map(ch => ({
        ...ch,
        contents: (ch.contents || []).map(cnt => ({
          _id: cnt._id,
          title: cnt.title,
          type: cnt.type,
          order: cnt.order,
          isLocked: true,
          url: "", // Mask URL
        }))
      }));
    }
    if (Array.isArray(courseObj.contents)) {
      courseObj.contents = courseObj.contents.map(cnt => ({
        ...cnt,
        isLocked: true,
        url: "", // Mask URL
      }));
    }
  }

  return courseObj;
};

// Helpers
// BUG-062: LMS is Central Admin exclusive now — State/Chapter/Business can no longer
// manage any course, including ones they created back when they still could.
const canManageCourse = (user) => user.role === ROLES.CENTRAL_ADMIN;

/**
 * Gets all enrollments for a course (Central Admin or Course Creator)
 */
export const getCourseEnrollments = async (courseId, user) => {
  const isCentralAdmin = user.role === ROLES.CENTRAL_ADMIN;
  const course = await Course.findById(courseId)
    .populate("enrollments.userId", "name email phone role organization")
    .populate("enrollments.businessId", "name slug logo")
    .populate("enrollments.paymentId", "invoiceNumber amount currency status paidAt method transactionId")
    .lean();
  if (!course) throw new NotFoundError("Course not found");

  const isCreator = String(course.createdBy?._id || course.createdBy) === String(user.id || user._id);
  if (!isCentralAdmin && !isCreator) {
    throw new ForbiddenError("You don't have permission to view enrollments for this course");
  }

  const enrollments = (course.enrollments || []).map(e => ({
    _id: e._id,
    user: e.userId || null,
    business: e.businessId || null,
    payment: e.paymentId || null,
    enrolledAt: e.enrolledAt,
  }));

  const totalLearners = enrollments.length;
  const totalRevenue = enrollments.reduce((acc, e) => acc + (Number(e.payment?.amount) || Number(course.price) || 0), 0);

  return {
    courseId: course._id,
    courseTitle: course.title,
    isPaid: course.isPaid,
    price: course.price,
    totalLearners,
    totalRevenue,
    enrollments,
  };
};

/**
 * Manually enrolls a user/business in a course (Central Admin only)
 */
export const manualEnrollUser = async (courseId, { userId, businessId, remark }, user) => {
  if (user.role !== ROLES.CENTRAL_ADMIN) {
    throw new ForbiddenError("Only Central Admin can manually enroll users in paid courses");
  }

  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");

  if (!userId && !businessId) {
    throw new BadRequestError("User ID or Business ID is required to enroll");
  }

  let userDoc = null;
  if (userId) {
    userDoc = await User.findById(userId);
    if (!userDoc) throw new NotFoundError("User not found");
  }

  let finalBusinessId = businessId || null;
  if (!finalBusinessId && userDoc) {
    const biz = await Business.findOne({ owner: userDoc._id }).select("_id");
    finalBusinessId = biz?._id || null;
  }

  const targetUserId = userId || userDoc?._id;

  const alreadyEnrolled = (course.enrollments || []).some(e => 
    (targetUserId && String(e.userId) === String(targetUserId)) || 
    (finalBusinessId && String(e.businessId) === String(finalBusinessId))
  );

  if (alreadyEnrolled) {
    throw new BadRequestError("This learner is already enrolled in this course");
  }

  course.enrollments = course.enrollments || [];
  course.enrollments.push({
    businessId: finalBusinessId,
    userId: targetUserId,
    paymentId: null, // manual admin enrollment
    enrolledAt: new Date(),
  });

  await course.save();

  if (targetUserId) {
    setImmediate(async () => {
      try {
        await notificationService.createNotification({
          recipientId: targetUserId,
          type: "System",
          title: "Enrolled in Course by Central Admin",
          body: `You have been granted access to "${course.title}". ${remark ? `Note: ${remark}` : ""}`,
          link: `/biz/lms/${course._id}`,
        });
      } catch (e) {}
    });
  }

  return { 
    success: true, 
    message: "Learner enrolled successfully", 
    courseId: course._id,
    enrollmentCount: course.enrollments.length 
  };
};


import { createCourse, updateCourse, getCourses, getCourseById, deleteCourse } from "./course.service.js";
import { markContentWatched, getCourseProgress } from "./watchProgress.service.js";
import { getBusinessCertificates, generateCertificate } from "./certificate.service.js";
import { Certificate } from "./certificate.model.js";
import { Business } from "../businesses/business.model.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { ApiResponse } from "../../shared/utils/response.js";
import { storageService } from "../../infrastructure/storage/storage.service.js";
import { ROLES } from "../../shared/constants/roles.js";

const resolveBusinessId = async (user, fallbackId) => {
  if (fallbackId) return fallbackId;
  if (user?.business?._id) return user.business._id;
  if (user?.businessId) return user.businessId;
  if (user?.id) {
    const biz = await Business.findOne({ owner: user.id }).select('_id');
    if (biz) return biz._id;
  }
  return null;
};

export const courseController = {
  createCourse: asyncHandler(async (req, res) => {
    const course = await createCourse(req.body, req.user);
    return ApiResponse.created(res, course, "Course created successfully");
  }),

  updateCourse: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const course = await updateCourse(id, req.body, req.user);
    return ApiResponse.success(res, course, "Course updated successfully");
  }),

  deleteCourse: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await deleteCourse(id, req.user);
    return ApiResponse.success(res, null, "Course deleted successfully");
  }),

  getCourses: asyncHandler(async (req, res) => {
    const courses = await getCourses(req.user, req.query);
    return ApiResponse.success(res, courses, "Courses retrieved successfully");
  }),

  getCourseDetails: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const course = await getCourseById(id, req.user);
    
    let progress = null;
    let certificate = null;
    if (req.user.role === ROLES.BUSINESS_OWNER) {
      const businessId = await resolveBusinessId(req.user);
      if (businessId) {
        progress = await getCourseProgress(businessId, id);
        certificate = await Certificate.findOne({ businessId, courseId: id }).lean();
        if (progress?.isCompleted && !certificate) {
          certificate = await generateCertificate(businessId, id);
        }
      }
    }

    return ApiResponse.success(res, { course, progress, certificate }, "Course details retrieved");
  }),

  uploadContent: asyncHandler(async (req, res) => {
    if (!req.file) {
       return ApiResponse.error(res, "No file uploaded", 400);
    }
    const fileUrl = await storageService.uploadFile(req.file, "courses");
    return ApiResponse.success(res, { url: fileUrl }, "File uploaded successfully");
  }),

  markWatched: asyncHandler(async (req, res) => {
    const { id, contentId } = req.params;
    const businessId = await resolveBusinessId(req.user, req.body.businessId); 
    
    if (!businessId) {
       return ApiResponse.error(res, "Business ID required", 400);
    }
    const result = await markContentWatched(businessId, id, contentId);
    return ApiResponse.success(res, result, result.message);
  }),

  getCertificates: asyncHandler(async (req, res) => {
    const businessId = await resolveBusinessId(req.user, req.query.businessId);
    if (!businessId) {
      return ApiResponse.error(res, "Business ID required", 400);
    }
    const certificates = await getBusinessCertificates(businessId);
    return ApiResponse.success(res, certificates, "Certificates retrieved");
  })
};


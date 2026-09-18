import { CourseProgress } from "./courseProgress.model.js";
import { Course } from "./course.model.js";
import { generateCertificate } from "./certificate.service.js";
import { NotFoundError, BadRequestError } from "../../shared/errors/errors.js";

// Helper to collect all contents from chapters and root contents
const getAllCourseContents = (course) => {
  const all = [];
  if (Array.isArray(course.chapters)) {
    for (const ch of course.chapters) {
      if (Array.isArray(ch.contents)) {
        all.push(...ch.contents);
      }
    }
  }
  if (Array.isArray(course.contents)) {
    all.push(...course.contents);
  }
  return all;
};

/**
 * Marks a course content as watched and triggers certificate generation if complete
 */
export const markContentWatched = async (businessId, courseId, contentId) => {
  // Check if course exists and has this content
  const course = await Course.findById(courseId);
  if (!course) throw new NotFoundError("Course not found");
  
  const allContents = getAllCourseContents(course);
  const content = allContents.find(c => String(c._id) === String(contentId));
  if (!content) throw new NotFoundError("Course content not found");

  // Get or create progress record
  let progress = await CourseProgress.findOne({ businessId, courseId });
  if (!progress) {
    progress = new CourseProgress({ businessId, courseId, completedContents: [] });
  }

  // Check if already watched
  const alreadyWatched = progress.completedContents.some(c => String(c.contentId) === String(contentId));
  if (!alreadyWatched) {
    progress.completedContents.push({ contentId });
  }

  // Check if all contents are watched
  if (!progress.isCompleted) {
    const allWatched = allContents.length > 0 && allContents.every(c => 
      progress.completedContents.some(pc => String(pc.contentId) === String(c._id))
    );

    if (allWatched) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
      await progress.save();
      
      // Trigger certificate generation
      await generateCertificate(businessId, courseId);
      return { message: "Content marked as watched. Course completed! Certificate generated.", isCompleted: true };
    }
  }
  
  await progress.save();
  return { message: "Content marked as watched.", isCompleted: progress.isCompleted };
};

export const getCourseProgress = async (businessId, courseId) => {
  return await CourseProgress.findOne({ businessId, courseId });
};

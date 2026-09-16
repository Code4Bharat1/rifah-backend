import { Chapter } from "./chapter.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { NotFoundError, ConflictError, ForbiddenError } from "../../shared/errors/errors.js";
import crypto from "crypto";

export const chapterService = {
  listChapters: async (filter = {}, user) => {
    const query = {};
    if (filter.status) query.status = filter.status;
    
    // RBAC: Chapter Admin & State Admin Scope Enforcement
    if (user && user.role === ROLES.CHAPTER_ADMIN) {
      query._id = user.chapterId || null;
    } else if (user && user.role === ROLES.STATE_ADMIN) {
      let state = user.state;
      if (!state && user.id) {
        const userDoc = await User.findById(user.id).select("state");
        state = userDoc?.state;
      }
      if (state) {
        query.state = new RegExp(`^${state.trim()}$`, "i");
      }
    }

    return Chapter.find(query).sort({ name: 1 });
  },

  getChapterById: async (id) => {
    const chapter = await Chapter.findById(id);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    return chapter;
  },

  getChapterDetails: async (id, requester) => {
    if (requester && requester.role === ROLES.CHAPTER_ADMIN && String(requester.chapterId || "") !== String(id)) {
      throw new NotFoundError("Chapter not found");
    }

    const chapter = await Chapter.findById(id);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }

    const [businessesCount, customersCount, admin] = await Promise.all([
      Business.countDocuments({ chapterId: chapter._id }),
      User.countDocuments({ chapterId: chapter._id, role: ROLES.CUSTOMER }),
      User.findOne({ chapterId: chapter._id, role: ROLES.CHAPTER_ADMIN }).select("-passwordHash"),
    ]);

    return {
      chapter,
      stats: { businessesCount, customersCount },
      admin,
    };
  },

  getChapterBySlug: async (slug) => {
    const chapter = await Chapter.findOne({ slug: slug.toLowerCase() });
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    return chapter;
  },

  createChapter: async (data, user) => {
    if (user && user.role === ROLES.STATE_ADMIN) {
      let state = user.state;
      if (!state && user.id) {
        const userDoc = await User.findById(user.id).select("state");
        state = userDoc?.state;
      }
      if (state) {
        data.state = state;
      }
    }
    const slug = generateSlug(data.name);
    const existing = await Chapter.findOne({ slug });
    if (existing) {
      throw new ConflictError("Chapter already exists");
    }

    return Chapter.create({
      ...data,
      slug,
    });
  },

  updateChapter: async (id, data) => {
    if (data.name) {
      data.slug = generateSlug(data.name);
    }
    const updated = await Chapter.findByIdAndUpdate(id, data, { new: true });
    if (!updated) {
      throw new NotFoundError("Chapter not found");
    }
    return updated;
  },

  addUnit: async (chapterId, unitData) => {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    chapter.units.push(unitData);
    await chapter.save();
    return chapter;
  },

  removeUnit: async (chapterId, unitId) => {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    chapter.units = chapter.units.filter((u) => String(u._id) !== String(unitId));
    await chapter.save();
    return chapter;
  },

  assignAdmin: async (chapterId, { name, email }, requester) => {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }

    // State Admin can only assign chapter admins within their state
    if (requester && requester.role === ROLES.STATE_ADMIN) {
      let requesterState = requester.state;
      if (!requesterState && requester.id) {
        const userDoc = await User.findById(requester.id).select("state role");
        requesterState = userDoc?.state;
        if (userDoc && !userDoc.state && chapter.state) {
          userDoc.state = chapter.state;
          await userDoc.save();
          requesterState = chapter.state;
        }
      }

      if (!requesterState) {
        throw new ForbiddenError("Your State Admin account is not associated with any state region.");
      }

      if (chapter.state && chapter.state.trim().toLowerCase() !== requesterState.trim().toLowerCase()) {
        throw new ForbiddenError(`You can only assign Chapter Admins for chapters within ${requesterState}`);
      }
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUserWithEmail = await User.findOne({ email: cleanEmail });
    // Check if an admin already exists for this chapter
    const oldAdmin = await User.findOne({ chapterId: chapter._id, role: ROLES.CHAPTER_ADMIN });
    if (oldAdmin && oldAdmin.email !== cleanEmail) {
      // Downgrade old admin to their previous role, or customer
      oldAdmin.role = oldAdmin.previousRole || ROLES.CUSTOMER;
      oldAdmin.previousRole = "";
      oldAdmin.chapterId = null;
      await oldAdmin.save();
      // Send removal notice
      if (oldAdmin.email) {
        await emailService.sendChapterAdminRemovalEmail(oldAdmin.email, oldAdmin.name, chapter.name);
      }
    }

    if (existingUserWithEmail) {
      if (existingUserWithEmail.role === ROLES.SUPER_ADMIN || existingUserWithEmail.role === ROLES.STATE_ADMIN) {
        throw new ConflictError("Cannot assign a Super Admin or State Admin as a Chapter Admin");
      }

      // If user is already Chapter Admin of another chapter, or upgrading
      if (existingUserWithEmail.role !== ROLES.CHAPTER_ADMIN) {
        existingUserWithEmail.previousRole = existingUserWithEmail.role;
      }
      
      existingUserWithEmail.role = ROLES.CHAPTER_ADMIN;
      existingUserWithEmail.chapter = chapter.name;
      existingUserWithEmail.chapterId = chapter._id;
      existingUserWithEmail.city = chapter.city || existingUserWithEmail.city || "";
      existingUserWithEmail.state = chapter.state || existingUserWithEmail.state || "";
      existingUserWithEmail.name = name.trim();
      await existingUserWithEmail.save();

      // Send the upgrade email without resetting password
      await emailService.sendChapterAdminUpgradeEmail(cleanEmail, null, chapter.name, name);
      return existingUserWithEmail;
    }

    // Generate random password
    const password = crypto.randomBytes(8).toString("hex");
    const passwordHash = await hashPassword(password);

    const admin = await User.create({
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: ROLES.CHAPTER_ADMIN,
      chapter: chapter.name,
      chapterId: chapter._id,
      city: chapter.city || "",
      state: chapter.state || "",
      forcePasswordChange: true,
    });

    // Send email with credentials
    await emailService.sendChapterAdminInvite(cleanEmail, password, chapter.name, name);

    return admin;
  },

  updateChapterStatus: async (id, status) => {
    if (!["Active", "Inactive"].includes(status)) {
      throw new BadRequestError("Invalid status value");
    }

    const chapter = await Chapter.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }

    return chapter;
  },
};

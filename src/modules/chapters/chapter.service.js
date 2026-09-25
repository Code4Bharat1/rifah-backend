import { Chapter } from "./chapter.model.js";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { generateSlug } from "../../shared/utils/generate-id.js";
import { resolveEligibleAdminBusiness } from "../../shared/utils/admin-eligibility.js";
import { NotFoundError, ConflictError, ForbiddenError, BadRequestError } from "../../shared/errors/errors.js";
import { logger } from "../../infrastructure/logger/logger.js";
import crypto from "crypto";

// Normalizes a chapter name for duplicate detection: case-insensitive, strips the
// generic word "chapter" and all non-alphanumerics, so "Pune", "pune chapter" and
// "Pune-Chapter" are all recognized as the same chapter (BUG-050: duplicate chapter
// records like "Pune" and "Pune Chapter" existing side by side for the same city).
const normalizeChapterName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\bchapter\b/g, "")
    .replace(/[^a-z0-9]/g, "");

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

    const chapters = await Chapter.find(query).sort({ name: 1 });
    const chapterIds = chapters.map((c) => c._id);
    const [chapterAdmins, businessesCounts] = await Promise.all([
      User.find({ role: ROLES.CHAPTER_ADMIN, chapterId: { $in: chapterIds } }).select("_id name email phone chapterId chapter"),
      Business.aggregate([
        { $match: { chapterId: { $in: chapterIds } } },
        { $group: { _id: "$chapterId", count: { $sum: 1 } } }
      ])
    ]);

    const adminByChapterId = new Map();
    chapterAdmins.forEach((ca) => {
      adminByChapterId.set(String(ca.chapterId), ca);
    });
    const countByChapterId = new Map();
    businessesCounts.forEach((b) => {
      countByChapterId.set(String(b._id), b.count);
    });

    return chapters.map((ch) => {
      const obj = ch.toObject();
      const admin = adminByChapterId.get(String(ch._id)) || null;
      return {
        ...obj,
        chapterAdmin: admin,
        hasAdmin: Boolean(admin),
        businessesCount: countByChapterId.get(String(ch._id)) || obj.businessesCount || 0,
      };
    });
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
    const existing = await Chapter.findOne({
      $or: [
        { slug },
        { name: new RegExp(`^${data.name.trim()}$`, "i") },
      ],
    });
    if (existing) {
      if (!existing.state || existing.state === "Unassigned") {
        // Orphaned chapter from a previously deleted state — safely detach and delete it
        await Promise.all([
          User.updateMany({ chapterId: existing._id }, { $set: { chapterId: null, chapter: "Unassigned" } }),
          Business.updateMany({ chapterId: existing._id }, { $set: { chapterId: null, chapter: "Unassigned" } }),
          Chapter.deleteOne({ _id: existing._id }),
        ]);
      } else {
        throw new ConflictError("Chapter already exists");
      }
    }

    // Guard against near-duplicate chapters for the same city/state that only differ
    // by the word "chapter" or punctuation/casing (e.g. "Pune" vs "Pune Chapter").
    const normalizedName = normalizeChapterName(data.name);
    if (normalizedName) {
      const cityStateQuery = {};
      if (data.state) cityStateQuery.state = new RegExp(`^${data.state.trim()}$`, "i");
      if (data.city) cityStateQuery.city = new RegExp(`^${data.city.trim()}$`, "i");
      const candidates = await Chapter.find(cityStateQuery).select("name city state");
      const nearDuplicate = candidates.find((c) => normalizeChapterName(c.name) === normalizedName);
      if (nearDuplicate) {
        throw new ConflictError(
          `A chapter with an equivalent name already exists for this city/state: "${nearDuplicate.name}". Use a distinct, more specific name to avoid duplicate chapter records.`
        );
      }
    }

    const chapter = await Chapter.create({
      name: data.name,
      city: data.city,
      state: data.state,
      slug,
      status: data.status || "Active",
    });

    // If businessId or manual admin credentials are provided, optionally allocate the Chapter Admin
    if (data.businessId || (data.adminName && data.adminEmail)) {
      await chapterService.assignAdmin(
        chapter._id,
        {
          businessId: data.businessId,
          name: data.adminName,
          email: data.adminEmail,
        },
        user
      );
    }

    return chapter;
  },

  updateChapter: async (id, data, user) => {
    const chapter = await Chapter.findById(id);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }

    if (user && user.role === ROLES.STATE_ADMIN) {
      let requesterState = user.state;
      if (!requesterState && user.id) {
        const userDoc = await User.findById(user.id).select("state");
        requesterState = userDoc?.state;
      }
      if (requesterState && chapter.state && chapter.state.trim().toLowerCase() !== requesterState.trim().toLowerCase()) {
        throw new ForbiddenError(`You can only update chapters within ${requesterState}`);
      }
      delete data.state;
    }

    if (data.name && data.name !== chapter.name) {
      data.slug = generateSlug(data.name);
      await Promise.all([
        User.updateMany({ chapterId: chapter._id }, { chapter: data.name }),
        Business.updateMany({ chapterId: chapter._id }, { chapter: data.name }),
      ]);
    }
    const updated = await Chapter.findByIdAndUpdate(id, data, { new: true });
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

  assignAdmin: async (chapterId, { businessId, name, email }, requester) => {
    // RBAC: Central Admin or State Admin can assign Chapter Admins
    if (!requester || (requester.role !== ROLES.STATE_ADMIN && requester.role !== ROLES.CENTRAL_ADMIN)) {
      throw new ForbiddenError("Only State Admins within their state or Central Admins can assign Chapter Admins.");
    }

    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }

    if (requester.role === ROLES.STATE_ADMIN) {
      // Resolve State Admin's state reliably
      let requesterState = requester.state;
      if (!requesterState && requester.id) {
        const userDoc = await User.findById(requester.id).select("state chapter chapterId city");
        requesterState = userDoc?.state;

        // If state is not set on userDoc, check user's chapter
        if (!requesterState && userDoc?.chapterId) {
          const userChapter = await Chapter.findById(userDoc.chapterId).select("state");
          if (userChapter?.state) {
            requesterState = userChapter.state;
            userDoc.state = requesterState;
            await userDoc.save();
          }
        }

        // If still missing state, and managing this chapter, auto-bind to this chapter's state
        if (!requesterState && chapter.state) {
          requesterState = chapter.state;
          if (userDoc) {
            userDoc.state = chapter.state;
            await userDoc.save();
          }
        }
      }

      if (!requesterState) {
        throw new ForbiddenError("Your State Admin account is not associated with any state region.");
      }

      // Strict boundary: Only State Admin within their state can assign Chapter Admins
      if (chapter.state && chapter.state.trim().toLowerCase() !== requesterState.trim().toLowerCase()) {
        throw new ForbiddenError(`You can only assign Chapter Admins for chapters within ${requesterState}`);
      }
    }

    let nominee;
    if (businessId) {
      const business = await resolveEligibleAdminBusiness(businessId);
      const nomineeId = business.owner?._id || business.owner;
      nominee = await User.findById(nomineeId).select("+passwordHash");
      if (!nominee && (business.ownerEmail || business.email)) {
        nominee = await User.findOne({ email: (business.ownerEmail || business.email).toLowerCase().trim() }).select("+passwordHash");
      }
    } else if (email) {
      const cleanEmail = email.toLowerCase().trim();
      nominee = await User.findOne({ email: cleanEmail }).select("+passwordHash");
      if (!nominee) {
        nominee = await User.create({
          name: name ? name.trim() : "Chapter Admin",
          email: cleanEmail,
          role: ROLES.CUSTOMER,
          isProfileComplete: true,
        });
      }
    } else {
      throw new BadRequestError("Please select a business owner or provide name and email to appoint a Chapter Admin.");
    }

    if (!nominee) {
      throw new BadRequestError("Could not resolve nominated user account for Chapter Admin appointment.");
    }

    // Update name or email if supplied
    if (name && name.trim()) {
      nominee.name = name.trim();
    }
    if (email && email.trim() && !nominee.email) {
      nominee.email = email.toLowerCase().trim();
    }

    if (nominee.role === ROLES.CENTRAL_ADMIN || nominee.role === ROLES.STATE_ADMIN) {
      throw new ConflictError("Cannot assign a Central Admin or State Admin as a Chapter Admin");
    }

    // Check if an admin already exists for this chapter
    const oldAdmin = await User.findOne({ chapterId: chapter._id, role: ROLES.CHAPTER_ADMIN });
    if (oldAdmin && String(oldAdmin._id) !== String(nominee._id)) {
      // Downgrade old admin to their previous role, or customer
      oldAdmin.role = oldAdmin.previousRole || ROLES.CUSTOMER;
      oldAdmin.previousRole = "";
      oldAdmin.chapterId = null;
      await oldAdmin.save();
      // Send removal notice
      if (oldAdmin.email) {
        try {
          await emailService.sendChapterAdminRemovalEmail(oldAdmin.email, oldAdmin.name, chapter.name);
        } catch (err) {
          logger.warn(`Failed to send chapter admin removal email to ${oldAdmin.email}: ${err.message}`);
        }
      }
    }

    // Generate a secure random password for the Chapter Admin (refreshed upon creation or re-allocation)
    const randomPassword = crypto.randomBytes(4).toString("hex"); // 8-character random alphanumeric password
    const passwordHash = await hashPassword(randomPassword);

    if (nominee.role !== ROLES.CHAPTER_ADMIN) {
      nominee.previousRole = nominee.role;
    }

    nominee.role = ROLES.CHAPTER_ADMIN;
    nominee.chapter = chapter.name;
    nominee.chapterId = chapter._id;
    nominee.city = chapter.city || nominee.city || "";
    nominee.state = chapter.state || nominee.state || "";
    nominee.passwordHash = passwordHash;
    nominee.forcePasswordChange = true;
    await nominee.save();

    // Send email with generated credentials & password to the assigned chapter admin email
    try {
      await emailService.sendChapterAdminInvite(nominee.email, randomPassword, chapter.name, nominee.name);
      logger.info(`[CHAPTER ADMIN APPOINTMENT] Password credentials sent to ${nominee.email} for chapter ${chapter.name}`);
    } catch (mailErr) {
      logger.error(`[CHAPTER ADMIN APPOINTMENT] Failed to send email credentials to ${nominee.email}:`, mailErr);
    }

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return nominee;
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

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return chapter;
  },

  removeAdmin: async (chapterId, requester) => {
    if (!requester || (requester.role !== ROLES.STATE_ADMIN && requester.role !== ROLES.CENTRAL_ADMIN)) {
      throw new ForbiddenError("Only State Admins or Central Admins can revoke Chapter Admins.");
    }
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    if (requester.role === ROLES.STATE_ADMIN) {
      let requesterState = requester.state;
      if (!requesterState && requester.id) {
        const userDoc = await User.findById(requester.id).select("state");
        requesterState = userDoc?.state;
      }
      if (requesterState && chapter.state && chapter.state.trim().toLowerCase() !== requesterState.trim().toLowerCase()) {
        throw new ForbiddenError(`You can only manage chapters within ${requesterState}`);
      }
    }

    const admin = await User.findOne({ chapterId: chapter._id, role: ROLES.CHAPTER_ADMIN });
    if (!admin) {
      throw new NotFoundError(`No active Chapter Admin found for ${chapter.name}`);
    }

    admin.role = admin.previousRole || ROLES.CUSTOMER;
    admin.previousRole = "";
    admin.chapterId = null;
    admin.chapter = "";
    await admin.save();

    if (admin.email) {
      await emailService.sendChapterAdminRemovalEmail(admin.email, admin.name, chapter.name);
    }

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return admin;
  },

  deleteChapter: async (chapterId, requester) => {
    if (!requester || (requester.role !== ROLES.STATE_ADMIN && requester.role !== ROLES.CENTRAL_ADMIN)) {
      throw new ForbiddenError("Only State Admins or Central Admins can delete chapters.");
    }
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) {
      throw new NotFoundError("Chapter not found");
    }
    if (requester.role === ROLES.STATE_ADMIN) {
      let requesterState = requester.state;
      if (!requesterState && requester.id) {
        const userDoc = await User.findById(requester.id).select("state");
        requesterState = userDoc?.state;
      }
      if (requesterState && chapter.state && chapter.state.trim().toLowerCase() !== requesterState.trim().toLowerCase()) {
        throw new ForbiddenError(`You can only manage chapters within ${requesterState}`);
      }
    }

    // Demote any active Chapter Admin
    const admin = await User.findOne({ chapterId: chapter._id, role: ROLES.CHAPTER_ADMIN });
    if (admin) {
      admin.role = admin.previousRole || ROLES.CUSTOMER;
      admin.previousRole = "";
      admin.chapterId = null;
      admin.chapter = "";
      await admin.save();
      if (admin.email) {
        await emailService.sendChapterAdminRemovalEmail(admin.email, admin.name, chapter.name);
      }
    }

    // Safely detach users and businesses to 'Unassigned'
    await Promise.all([
      User.updateMany({ chapterId: chapter._id }, { $set: { chapterId: null, chapter: "Unassigned" } }),
      Business.updateMany({ chapterId: chapter._id }, { $set: { chapterId: null, chapter: "Unassigned" } }),
      Chapter.findByIdAndDelete(chapter._id),
    ]);

    // Real-time Copilot Knowledge Base Sync
    try {
      const { syncLiveEntitiesToFile } = await import("../copilot/copilot.sync.js");
      syncLiveEntitiesToFile(true).catch(() => {});
    } catch {}

    return { success: true, message: `Chapter ${chapter.name} deleted successfully` };
  },
};

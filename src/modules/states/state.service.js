import { User } from "../users/user.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { hashPassword } from "../../infrastructure/auth/password.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { NotFoundError, ConflictError, BadRequestError } from "../../shared/errors/errors.js";
import crypto from "crypto";

export const stateService = {
  /**
   * Lists states dynamically discovered from assigned State Admins and existing Chapters.
   * NO hardcoded states array. If requester is STATE_ADMIN, returns only their assigned state.
   */
  listStates: async (requester) => {
    // If requester is a State Admin, restrict exclusively to their assigned state
    if (requester && requester.role === ROLES.STATE_ADMIN && requester.state) {
      const stateAdmin = await User.findOne({
        role: ROLES.STATE_ADMIN,
        state: new RegExp(`^${requester.state.trim()}$`, "i"),
      }).select("_id name email phone state createdAt lastLoginAt");

      const stateChapters = await Chapter.find({
        state: new RegExp(`^${requester.state.trim()}$`, "i"),
      }).select("_id name city state status businessesCount membersCount");

      const activeChaptersCount = stateChapters.filter((c) => c.status === "Active").length;
      const totalBusinesses = stateChapters.reduce((sum, c) => sum + (c.businessesCount || 0), 0);

      return [
        {
          state: requester.state,
          admin: stateAdmin,
          chaptersCount: stateChapters.length,
          activeChaptersCount,
          totalBusinesses,
          chapters: stateChapters,
          hasAdmin: Boolean(stateAdmin),
        },
      ];
    }

    // Discover all distinct states from State Admins and Chapters dynamically
    const [adminStates, chapterStates] = await Promise.all([
      User.distinct("state", { role: ROLES.STATE_ADMIN, state: { $nin: ["", null] } }),
      Chapter.distinct("state", { state: { $nin: ["", null] } }),
    ]);

    // Consolidate unique states (case-insensitive deduplication)
    const uniqueStateMap = new Map();
    [...adminStates, ...chapterStates].forEach((st) => {
      if (st && typeof st === "string" && st.trim()) {
        const clean = st.trim();
        const key = clean.toLowerCase();
        if (!uniqueStateMap.has(key)) {
          uniqueStateMap.set(key, clean);
        }
      }
    });

    const targetStates = Array.from(uniqueStateMap.values());

    // Fetch all State Admins in one query
    const stateAdmins = await User.find({
      role: ROLES.STATE_ADMIN,
    }).select("_id name email phone state createdAt lastLoginAt");

    const adminByStateMap = new Map();
    stateAdmins.forEach((admin) => {
      if (admin.state) {
        adminByStateMap.set(admin.state.trim().toLowerCase(), admin);
      }
    });

    // Fetch all Chapters in one query
    const allChapters = await Chapter.find({}).select("_id name city state status businessesCount membersCount");
    const chaptersByStateMap = new Map();
    allChapters.forEach((ch) => {
      const st = (ch.state || "").trim().toLowerCase();
      if (!chaptersByStateMap.has(st)) {
        chaptersByStateMap.set(st, []);
      }
      chaptersByStateMap.get(st).push(ch);
    });

    // Build formatted state objects
    const result = targetStates.map((stateName) => {
      const key = stateName.trim().toLowerCase();
      const admin = adminByStateMap.get(key) || null;
      const chapters = chaptersByStateMap.get(key) || [];
      const activeChaptersCount = chapters.filter((c) => c.status === "Active").length;
      const totalBusinesses = chapters.reduce((sum, c) => sum + (c.businessesCount || 0), 0);

      return {
        state: stateName,
        admin,
        chaptersCount: chapters.length,
        activeChaptersCount,
        totalBusinesses,
        chapters,
        hasAdmin: Boolean(admin),
      };
    });

    // Sort: States with active admins/chapters first, then alphabetically
    return result.sort((a, b) => {
      if (a.hasAdmin && !b.hasAdmin) return -1;
      if (!a.hasAdmin && b.hasAdmin) return 1;
      if (a.chaptersCount > 0 && b.chaptersCount === 0) return -1;
      if (a.chaptersCount === 0 && b.chaptersCount > 0) return 1;
      return a.state.localeCompare(b.state);
    });
  },

  /**
   * Retrieves single state details with chapters and chapter admins
   */
  getStateByName: async (stateName, requester) => {
    if (!stateName) throw new BadRequestError("State name is required");

    if (requester && requester.role === ROLES.STATE_ADMIN) {
      if ((requester.state || "").trim().toLowerCase() !== stateName.trim().toLowerCase()) {
        throw new NotFoundError("State not found or access denied");
      }
    }

    const stateRegex = new RegExp(`^${stateName.trim()}$`, "i");
    const [admin, chapters] = await Promise.all([
      User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex }).select("-passwordHash"),
      Chapter.find({ state: stateRegex }).sort({ name: 1 }),
    ]);

    const chapterIds = chapters.map((c) => c._id);
    const [chapterAdmins, totalBusinesses] = await Promise.all([
      User.find({ role: ROLES.CHAPTER_ADMIN, chapterId: { $in: chapterIds } }).select("_id name email phone chapterId chapter"),
      Business.countDocuments({ chapterId: { $in: chapterIds } }),
    ]);

    const adminByChapterId = new Map();
    chapterAdmins.forEach((ca) => {
      adminByChapterId.set(String(ca.chapterId), ca);
    });

    const enrichedChapters = chapters.map((ch) => ({
      ...ch.toObject(),
      chapterAdmin: adminByChapterId.get(String(ch._id)) || null,
    }));

    return {
      state: stateName,
      admin,
      chapters: enrichedChapters,
      chaptersCount: chapters.length,
      totalBusinesses,
    };
  },

  /**
   * Super Admin allocates a state to a State Admin.
   * Creates new user or upgrades existing user to ROLES.STATE_ADMIN.
   */
  assignStateAdmin: async ({ state, name, email, phone }) => {
    if (!state || !email || !name) {
      throw new BadRequestError("State, Name, and Email are required");
    }

    const cleanState = state.trim();
    const cleanEmail = email.trim().toLowerCase();
    const stateRegex = new RegExp(`^${cleanState}$`, "i");

    // Check if an admin already exists for this state
    const currentAdmin = await User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex });
    if (currentAdmin && currentAdmin.email !== cleanEmail) {
      // Demote current admin
      currentAdmin.role = currentAdmin.previousRole || ROLES.CUSTOMER;
      currentAdmin.previousRole = "";
      currentAdmin.state = "";
      await currentAdmin.save();
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      if (existingUser.role === ROLES.SUPER_ADMIN) {
        throw new ConflictError("Cannot reassign a Super Admin as a State Admin");
      }

      if (existingUser.role !== ROLES.STATE_ADMIN) {
        existingUser.previousRole = existingUser.role;
      }

      existingUser.role = ROLES.STATE_ADMIN;
      existingUser.state = cleanState;
      existingUser.name = name.trim();
      if (phone) existingUser.phone = phone.trim();
      await existingUser.save();

      // Send upgrade notification email
      await emailService.sendStateAdminUpgradeEmail(cleanEmail, cleanState, existingUser.name);

      return existingUser;
    }

    // New user creation
    const password = crypto.randomBytes(8).toString("hex");
    const passwordHash = await hashPassword(password);

    const newAdmin = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: phone ? phone.trim() : "",
      passwordHash,
      role: ROLES.STATE_ADMIN,
      state: cleanState,
      forcePasswordChange: true,
    });

    // Send invitation email with credentials
    await emailService.sendStateAdminInvite(cleanEmail, password, cleanState, newAdmin.name);

    return newAdmin;
  },

  /**
   * Super Admin revokes a State Admin from a state
   */
  removeStateAdmin: async (stateName) => {
    const stateRegex = new RegExp(`^${stateName.trim()}$`, "i");
    const admin = await User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex });

    if (!admin) {
      throw new NotFoundError(`No active State Admin found for ${stateName}`);
    }

    admin.role = admin.previousRole || ROLES.CUSTOMER;
    admin.previousRole = "";
    admin.state = "";
    await admin.save();

    return admin;
  },
};

export default stateService;

import { User } from "../users/user.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { Business } from "../businesses/business.model.js";
import { Event } from "../events/event.model.js";
import { Referral } from "../networking/referral.model.js";
import { OneToOne } from "../networking/one-to-one.model.js";
import { ThankYouNote } from "../networking/thank-you-note.model.js";
import { StateProfile } from "./state-profile.model.js";
import { ROLES } from "../../shared/constants/roles.js";
import { emailService } from "../../infrastructure/email/email.service.js";
import { NotFoundError, ConflictError, BadRequestError } from "../../shared/errors/errors.js";
import { resolveEligibleAdminBusiness } from "../../shared/utils/admin-eligibility.js";

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

    // Fetch all StateProfiles
    const allProfiles = await StateProfile.find({});
    const profileByStateMap = new Map();
    allProfiles.forEach((p) => {
      profileByStateMap.set(p.name.trim().toLowerCase(), p);
    });

    // Add states from profiles that might not have an admin or chapter yet
    allProfiles.forEach((p) => {
      const key = p.name.trim().toLowerCase();
      if (!uniqueStateMap.has(key)) {
        uniqueStateMap.set(key, p.name.trim());
        targetStates.push(p.name.trim());
      }
    });

    // Build formatted state objects
    const result = targetStates.map((stateName) => {
      const key = stateName.trim().toLowerCase();
      const admin = adminByStateMap.get(key) || null;
      const chapters = chaptersByStateMap.get(key) || [];
      const profile = profileByStateMap.get(key) || null;
      const activeChaptersCount = chapters.filter((c) => c.status === "Active").length;
      const totalBusinesses = chapters.reduce((sum, c) => sum + (c.businessesCount || 0), 0);

      return {
        state: stateName,
        admin,
        profile,
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
    const [admin, chapters, profile] = await Promise.all([
      User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex }).select("-passwordHash"),
      Chapter.find({ state: stateRegex }).sort({ name: 1 }),
      StateProfile.findOne({ name: stateRegex })
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
      profile,
      chapters: enrichedChapters,
      chaptersCount: chapters.length,
      totalBusinesses,
    };
  },

  /**
   * Central Admin allocates a state to a State Admin. The nominee must
   * already own a paid, verified business — closes the loophole where a
   * fresh, unpaid, unverified account could become a State Admin. The state
   * itself is derived from the business, not free-typed, so it can't drift.
   * Upserts the StateProfile with image and address.
   */
  assignStateAdmin: async ({ businessId, image, address }) => {
    const business = await resolveEligibleAdminBusiness(businessId);
    const nominee = business.owner;

    const cleanState = (business.state || "").trim();
    if (!cleanState) {
      throw new BadRequestError("This business does not have a state on file.");
    }
    const stateRegex = new RegExp(`^${cleanState}$`, "i");

    if (nominee.role === ROLES.CENTRAL_ADMIN) {
      throw new ConflictError("Cannot reassign a Central Admin as a State Admin");
    }

    // Check if an admin already exists for this state
    const currentAdmin = await User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex });
    if (currentAdmin && String(currentAdmin._id) !== String(nominee._id)) {
      // Demote current admin
      currentAdmin.role = currentAdmin.previousRole || ROLES.CUSTOMER;
      currentAdmin.previousRole = "";
      currentAdmin.state = "";
      await currentAdmin.save();
    }

    const upsertStateProfile = async () => {
      await StateProfile.findOneAndUpdate(
        { name: cleanState },
        {
          name: cleanState,
          ...(image && { image }),
          ...(address && { address }),
          email: nominee.email,
          ...(nominee.phone && { phone: nominee.phone }),
        },
        { upsert: true, new: true, runValidators: true }
      );
    };

    if (nominee.role !== ROLES.STATE_ADMIN) {
      nominee.previousRole = nominee.role;
    }
    nominee.role = ROLES.STATE_ADMIN;
    nominee.state = cleanState;
    await nominee.save();

    await emailService.sendStateAdminUpgradeEmail(nominee.email, cleanState, nominee.name);
    await upsertStateProfile();

    return nominee;
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

  /**
   * Edit a state globally across all collections
   */
  updateState: async (oldStateName, newStateName) => {
    const oldRegex = new RegExp(`^${oldStateName.trim()}$`, "i");
    const newName = newStateName.trim();

    if (!newName) {
      throw new BadRequestError("New state name cannot be empty");
    }

    // Update Users
    await User.updateMany({ state: oldRegex }, { $set: { state: newName } });
    
    // Update Chapters
    await Chapter.updateMany({ state: oldRegex }, { $set: { state: newName } });
    
    // Update Businesses
    await Business.updateMany({ state: oldRegex }, { $set: { state: newName } });

    // Update Events (targetStates array)
    await Event.updateMany(
      { targetStates: oldRegex },
      { $set: { "targetStates.$": newName } }
    );

    // Update Networking Modules
    await Referral.updateMany({ referrerState: oldRegex }, { $set: { referrerState: newName } });
    await Referral.updateMany({ referredState: oldRegex }, { $set: { referredState: newName } });
    await OneToOne.updateMany({ initiatorState: oldRegex }, { $set: { initiatorState: newName } });
    await OneToOne.updateMany({ memberState: oldRegex }, { $set: { memberState: newName } });
    await ThankYouNote.updateMany({ giverState: oldRegex }, { $set: { giverState: newName } });
    await ThankYouNote.updateMany({ receiverState: oldRegex }, { $set: { receiverState: newName } });

    return { message: "State renamed successfully", state: newName };
  },

  deleteState: async (stateName) => {
    const stateRegex = new RegExp(`^${stateName.trim()}$`, "i");

    // 1. Revoke State Admin if exists
    const admin = await User.findOne({ role: ROLES.STATE_ADMIN, state: stateRegex });
    if (admin) {
      admin.role = admin.previousRole || ROLES.CUSTOMER;
      admin.previousRole = "";
      admin.state = "Unassigned";
      await admin.save();
    }

    // 2. Set all related users' state to Unassigned (including chapter admins, members, etc.)
    await User.updateMany({ state: stateRegex }, { $set: { state: "Unassigned" } });

    // 3. Set all Chapters' state to Unassigned
    await Chapter.updateMany({ state: stateRegex }, { $set: { state: "Unassigned" } });

    // 4. Set all Businesses' state to Unassigned
    await Business.updateMany({ state: stateRegex }, { $set: { state: "Unassigned" } });

    // (TargetStates in events could also be handled, or left as is, removing it from targetStates might be safer)
    await Event.updateMany(
      { targetStates: stateRegex },
      { $pull: { targetStates: stateRegex } }
    );

    // Update Networking Modules to Unassigned
    const unassigned = "Unassigned";
    await Referral.updateMany({ referrerState: stateRegex }, { $set: { referrerState: unassigned } });
    await Referral.updateMany({ referredState: stateRegex }, { $set: { referredState: unassigned } });
    await OneToOne.updateMany({ initiatorState: stateRegex }, { $set: { initiatorState: unassigned } });
    await OneToOne.updateMany({ memberState: stateRegex }, { $set: { memberState: unassigned } });
    await ThankYouNote.updateMany({ giverState: stateRegex }, { $set: { giverState: unassigned } });
    await ThankYouNote.updateMany({ receiverState: stateRegex }, { $set: { receiverState: unassigned } });

    return { message: "State deleted (detached) successfully" };
  },

  /**
   * Edit a state profile (image, address, etc)
   */
  updateStateProfile: async (stateName, { image, address, phone, email }) => {
    const cleanState = stateName.trim();
    if (!cleanState) {
      throw new BadRequestError("State name is required");
    }

    const updatedProfile = await StateProfile.findOneAndUpdate(
      { name: new RegExp(`^${cleanState}$`, "i") },
      { 
        $set: {
          name: cleanState,
          ...(image !== undefined && { image }),
          ...(address !== undefined && { address }),
          ...(phone !== undefined && { phone }),
          ...(email !== undefined && { email })
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return updatedProfile;
  },
};

export default stateService;

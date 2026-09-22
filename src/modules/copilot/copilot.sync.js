import fs from "fs";
import path from "path";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { Chapter } from "../chapters/chapter.model.js";
import { ROLES } from "../../shared/constants/roles.js";

const KB_PATH = path.resolve(process.cwd(), "../rifah_features_knowledge_base.json");

let lastSyncTimestamp = 0;
const SYNC_THROTTLE_MS = 10000; // 10s query throttle

/**
 * Synchronizes active Central Admins, State Admins, Chapter Admins, Chapters, and Businesses
 * from MongoDB into rifah_features_knowledge_base.json.
 *
 * CRITICAL RULE:
 * - Only records with status === "Active" (or "Live") are included.
 * - Any user or business that is deleted, deactivated, suspended, or inactive
 *   is AUTOMATICALLY excluded and therefore DELETED from the file.
 *
 * @param {boolean} force - If true, bypasses throttle and syncs immediately
 */
export async function syncLiveEntitiesToFile(force = false) {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < SYNC_THROTTLE_MS) {
    return getCachedLiveEntities();
  }

  try {
    // 1. Fetch only ACTIVE admins, chapters & businesses
    const [centralAdmins, stateAdmins, chapterAdmins, chapters, businesses] = await Promise.all([
      User.find({
        role: { $in: [ROLES.CENTRAL_ADMIN, "central_admin", "super_admin"] },
        status: {
          $nin: ["suspended", "Suspended", "inactive", "Inactive", "deleted", "Deleted", "deactivated", "Deactivated"],
        },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      User.find({
        role: { $in: [ROLES.STATE_ADMIN, "state_admin"] },
        status: {
          $nin: ["suspended", "Suspended", "inactive", "Inactive", "deleted", "Deleted", "deactivated", "Deactivated"],
        },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      User.find({
        role: { $in: [ROLES.CHAPTER_ADMIN, "chapter_admin"] },
        status: {
          $nin: ["suspended", "Suspended", "inactive", "Inactive", "deleted", "Deleted", "deactivated", "Deactivated"],
        },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      Chapter.find({
        status: {
          $nin: ["suspended", "Suspended", "inactive", "Inactive", "deleted", "Deleted"],
        },
      })
        .select("_id name slug city state lead membersCount businessesCount status")
        .lean(),

      Business.find({
        status: {
          $nin: ["suspended", "Suspended", "inactive", "Inactive", "deleted", "Deleted", "rejected", "Rejected"],
        },
      })
        .populate("owner", "name email phone")
        .populate("chapterId", "name state city")
        .select("_id name slug tagline industry categories city state chapter chapterId address status owner isVerified")
        .lean(),
    ]);

    // Build chapter lookup map (by name lowercase and id string)
    const chapterLookup = {};
    chapters.forEach((c) => {
      if (c.name) chapterLookup[c.name.toLowerCase().trim()] = c;
      if (c._id) chapterLookup[String(c._id)] = c;
    });

    const liveEntities = {
      lastSyncedAt: new Date().toISOString(),
      counts: {
        centralAdmins: centralAdmins.length,
        stateAdmins: stateAdmins.length,
        chapterAdmins: chapterAdmins.length,
        chapters: chapters.length,
        businesses: businesses.length,
      },
      centralAdmins: centralAdmins.map((u) => ({
        id: String(u._id),
        name: u.name || "Central Administrator",
        email: u.email,
        phone: u.phone || "",
        role: "central_admin",
        status: u.status,
      })),
      stateAdmins: stateAdmins.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        state: u.state || "National",
        role: "state_admin",
        status: u.status,
      })),
      chapterAdmins: chapterAdmins.map((u) => {
        const chapName = u.chapter || "Unassigned Chapter";
        const chapObj = chapterLookup[chapName.toLowerCase().trim()] || {};
        return {
          id: String(u._id),
          name: u.name,
          email: u.email,
          phone: u.phone || "",
          chapter: chapName,
          state: u.state || chapObj.state || "",
          role: "chapter_admin",
          status: u.status,
        };
      }),
      chapters: chapters.map((c) => ({
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        city: c.city || "",
        state: c.state || "",
        lead: c.lead || "",
        businessesCount: c.businessesCount || 0,
        membersCount: c.membersCount || 0,
        status: c.status || "Active",
      })),
      businesses: businesses.map((b) => {
        const chapName = b.chapter || b.chapterId?.name || "";
        const chapObj =
          (chapName ? chapterLookup[chapName.toLowerCase().trim()] : null) ||
          (b.chapterId ? chapterLookup[String(b.chapterId?._id || b.chapterId)] : null) ||
          {};
        const state = b.state || b.chapterId?.state || chapObj.state || "";
        const city = b.city || b.chapterId?.city || chapObj.city || "";
        return {
          id: String(b._id),
          name: b.name,
          slug: b.slug,
          industry: b.industry || (b.categories && b.categories[0]) || "General Business",
          categories: b.categories || [],
          city: city,
          state: state,
          chapter: chapName || chapObj.name || "",
          ownerName: b.owner?.name || "Business Member",
          ownerEmail: b.owner?.email || "",
          status: b.status,
          isVerified: Boolean(b.isVerified),
        };
      }),
    };

    lastSyncTimestamp = now;

    // Persist to rifah_features_knowledge_base.json
    if (fs.existsSync(KB_PATH)) {
      const raw = fs.readFileSync(KB_PATH, "utf8");
      const kbData = JSON.parse(raw);
      kbData.liveEntities = liveEntities;
      fs.writeFileSync(KB_PATH, JSON.stringify(kbData, null, 2), "utf8");
    }

    return liveEntities;
  } catch (error) {
    console.error("[CopilotSync] Error syncing live entities:", error.message);
    return getCachedLiveEntities();
  }
}

/**
 * Read cached liveEntities from the JSON file
 */
export function getCachedLiveEntities() {
  try {
    if (fs.existsSync(KB_PATH)) {
      const raw = fs.readFileSync(KB_PATH, "utf8");
      const kbData = JSON.parse(raw);
      return (
        kbData.liveEntities || {
          centralAdmins: [],
          stateAdmins: [],
          chapterAdmins: [],
          chapters: [],
          businesses: [],
        }
      );
    }
  } catch (err) {
    console.error("[CopilotSync] Error reading cached entities:", err.message);
  }
  return {
    centralAdmins: [],
    stateAdmins: [],
    chapterAdmins: [],
    chapters: [],
    businesses: [],
  };
}

import fs from "fs";
import path from "path";
import { User } from "../users/user.model.js";
import { Business } from "../businesses/business.model.js";
import { ROLES } from "../../shared/constants/roles.js";

const KB_PATH = path.resolve(process.cwd(), "../rifah_features_knowledge_base.json");

let lastSyncTimestamp = 0;
const SYNC_THROTTLE_MS = 10000; // 10s query throttle

/**
 * Synchronizes active Central Admins, State Admins, Chapter Admins, and Businesses
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
    // 1. Fetch only ACTIVE admins & businesses
    const [centralAdmins, stateAdmins, chapterAdmins, businesses] = await Promise.all([
      User.find({
        role: ROLES.CENTRAL_ADMIN,
        status: { $regex: /^active$/i },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      User.find({
        role: ROLES.STATE_ADMIN,
        status: { $regex: /^active$/i },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      User.find({
        role: ROLES.CHAPTER_ADMIN,
        status: { $regex: /^active$/i },
      })
        .select("_id name email phone role status state chapter organization")
        .lean(),

      Business.find({
        status: { $regex: /^(active|live)$/i },
      })
        .populate("owner", "name email phone")
        .select("_id name slug tagline industry categories city state chapter address status owner isVerified")
        .lean(),
    ]);

    const liveEntities = {
      lastSyncedAt: new Date().toISOString(),
      counts: {
        centralAdmins: centralAdmins.length,
        stateAdmins: stateAdmins.length,
        chapterAdmins: chapterAdmins.length,
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
      chapterAdmins: chapterAdmins.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        chapter: u.chapter || "Unassigned Chapter",
        state: u.state || "",
        role: "chapter_admin",
        status: u.status,
      })),
      businesses: businesses.map((b) => ({
        id: String(b._id),
        name: b.name,
        slug: b.slug,
        industry: b.industry || (b.categories && b.categories[0]) || "General Business",
        categories: b.categories || [],
        city: b.city || "",
        state: b.state || "",
        chapter: b.chapter || "",
        ownerName: b.owner?.name || "Business Member",
        ownerEmail: b.owner?.email || "",
        status: b.status,
        isVerified: Boolean(b.isVerified),
      })),
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
      return kbData.liveEntities || {
        centralAdmins: [],
        stateAdmins: [],
        chapterAdmins: [],
        businesses: [],
      };
    }
  } catch (err) {
    console.error("[CopilotSync] Error reading cached entities:", err.message);
  }
  return {
    centralAdmins: [],
    stateAdmins: [],
    chapterAdmins: [],
    businesses: [],
  };
}

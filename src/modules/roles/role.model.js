import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
    level: {
      type: String,
      // "Leadership" added alongside the existing org-structure levels: the
      // Roles > Leadership Role admin screen was saving edits with a level value
      // this enum didn't recognize, so schema validation (runValidators: true on
      // update) silently rejected every edit to a Leadership role (BUG-033).
      enum: ["Central", "State", "Chapter", "Leadership"],
      default: "Central",
      index: true,
    },
    state: {
      type: String,
      trim: true,
      index: true,
    },
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },

    // --- RBAC extension ---
    // Links to a RolePermissionTemplate that defines what this assignment can do / see.
    // null = legacy "display-only" leadership role (no panel access granted).
    permissionTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RolePermissionTemplate",
      default: null,
      index: true,
    },

    // Which panel the user should land in when they select this role at login.
    // Defaults to the level-appropriate admin panel.
    // "chapter-admin" | "state-admin" | "central-admin" | null
    panelType: {
      type: String,
      enum: ["chapter-admin", "state-admin", "central-admin", null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate roles for the same user in active state?
// Since a person shouldn't have duplicate identical active roles:
// roleSchema.index({ userId: 1, role: 1 }, { unique: true });

export const Role = mongoose.model("Role", roleSchema);
export default Role;

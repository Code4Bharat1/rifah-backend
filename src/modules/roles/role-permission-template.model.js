import mongoose from "mongoose";

/**
 * RolePermissionTemplate
 *
 * Central/State/Chapter admins create these templates to define what a
 * custom org role (e.g. "Chapter Secretary") can see and do.
 *
 * - `permissions`: functional permissions (PERMISSIONS constants)
 * - `allowedNavRoutes`: sidebar route paths the role can navigate to
 * - `level`: which tier this template applies to
 * - `scope`: optional – restrict template to a specific state or chapter
 */
const rolePermissionTemplateSchema = new mongoose.Schema(
  {
    // The display name of the role, e.g. "Chapter Secretary", "State Treasurer"
    name: {
      type: String,
      required: [true, "Role template name is required"],
      trim: true,
    },

    // Which organisational tier this role lives at
    level: {
      type: String,
      enum: ["Chapter", "State", "Central"],
      required: true,
      index: true,
    },

    // The specific state this template is scoped to (for State-level roles)
    state: {
      type: String,
      trim: true,
      default: null,
    },

    // The specific chapter this template is scoped to (for Chapter-level roles)
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      default: null,
      index: true,
    },

    // Functional permissions (from PERMISSIONS constants)
    // e.g. ["event:manage", "reports:read", "chapter:manage"]
    permissions: {
      type: [String],
      default: [],
    },

    // Sidebar route paths the role is allowed to navigate to
    // e.g. ["/chapter-admin", "/chapter-admin/events", "/chapter-admin/members"]
    allowedNavRoutes: {
      type: [String],
      default: [],
    },

    // Description / notes for the admin
    description: {
      type: String,
      trim: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Who created this template
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const RolePermissionTemplate = mongoose.model(
  "RolePermissionTemplate",
  rolePermissionTemplateSchema
);
export default RolePermissionTemplate;

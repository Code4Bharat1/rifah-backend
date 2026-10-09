import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { User } from "../src/modules/users/user.model.js";
import { Role } from "../src/modules/roles/role.model.js";
import { RolePermissionTemplate } from "../src/modules/roles/role-permission-template.model.js";
import { Chapter } from "../src/modules/chapters/chapter.model.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { connectDatabase, disconnectDatabase } from "../src/infrastructure/database/mongoose.js";

async function runTest() {
  try {
    console.log("Connecting to database...");
    await connectDatabase();
    console.log("Connected to database successfully.\n");

    // 1. Find or create a test chapter
    let chapter = await Chapter.findOne();
    if (!chapter) {
      chapter = await Chapter.create({ name: "Mumbai Central Chapter", state: "Maharashtra", code: "MUM-01" });
      console.log("Created test chapter:", chapter.name);
    } else {
      console.log("Using existing chapter:", chapter.name);
    }

    // 2. Find test business owner
    let testUser = await User.findOne({ role: "business_owner" });
    if (!testUser) {
      console.log("No business owner found, finding any user...");
      testUser = await User.findOne();
    }
    console.log("Test user:", testUser.email, "(Role:", testUser.role, "ID:", testUser._id.toString(), ")");

    // 3. Create or find an RBAC template for Chapter Secretary
    let template = await RolePermissionTemplate.findOne({ name: "Chapter Secretary Test", level: "Chapter" });
    if (!template) {
      template = await RolePermissionTemplate.create({
        name: "Chapter Secretary Test",
        level: "Chapter",
        chapterId: chapter._id,
        permissions: ["chapter.view", "chapter.members.view", "events.view"],
        allowedNavRoutes: ["/chapter-admin", "/chapter-admin/operations", "/chapter-admin/members"],
        description: "Test Secretary template with limited sidebar items",
        createdBy: testUser._id,
        isActive: true,
      });
      console.log("Created RBAC template:", template.name, "ID:", template._id.toString());
    } else {
      console.log("Found existing RBAC template:", template.name);
    }

    // 4. Assign user to Leadership Role with this RBAC template
    let roleAssignment = await Role.findOne({ userId: testUser._id, role: "Secretary" });
    if (!roleAssignment) {
      roleAssignment = await Role.create({
        userId: testUser._id,
        role: "Secretary",
        level: "Chapter",
        chapterId: chapter._id,
        status: "Active",
        permissionTemplateId: template._id,
        panelType: "chapter-admin",
        displayOrder: 1,
      });
      console.log("Created role assignment:", roleAssignment.role, "for user", testUser.name);
    } else {
      roleAssignment.permissionTemplateId = template._id;
      roleAssignment.panelType = "chapter-admin";
      roleAssignment.status = "Active";
      await roleAssignment.save();
      console.log("Updated role assignment with RBAC template");
    }

    // 5. Test authService.getMe() discovers available workspaces
    console.log("\n--- Testing getMe availableWorkspaces discovery ---");
    const userMe = await authService.getMe(testUser._id, testUser.role);
    console.log("User availableWorkspaces:", userMe.availableWorkspaces);

    if (!Array.isArray(userMe.availableWorkspaces) || userMe.availableWorkspaces.length < 2) {
      throw new Error("Expected at least 2 available workspaces (base system role + org role)");
    }

    const orgWs = userMe.availableWorkspaces.find((ws) => ws.type === "org_role");
    if (!orgWs) {
      throw new Error("Expected org_role workspace in availableWorkspaces");
    }
    console.log("Discovered Org Workspace:", {
      workspaceId: orgWs.workspaceId,
      roleName: orgWs.roleName,
      panelType: orgWs.panelType,
      allowedNavRoutes: orgWs.allowedNavRoutes,
    });
    console.log(">>> PASS: getMe successfully discovers all available workspaces!\n");

    // 6. Test switchRole to the Org Role workspace
    console.log("--- Testing switchRole to Org Role workspace ---");
    const switchResult = await authService.switchRole(
      testUser._id,
      "chapter_admin",
      String(roleAssignment._id)
    );

    console.log("Switch result message:", switchResult.message || "Switched successfully");
    const decodedAccess = jwt.decode(switchResult.accessToken);
    console.log("Decoded JWT Access Token Claims:");
    console.log("  - sub/id:", decodedAccess.id || decodedAccess.sub);
    console.log("  - role (real DB role):", decodedAccess.role);
    console.log("  - orgWorkspaceId:", decodedAccess.orgWorkspaceId);
    console.log("  - orgRoleName:", decodedAccess.orgRoleName);
    console.log("  - orgPanelType:", decodedAccess.orgPanelType);
    console.log("  - orgAllowedNavRoutes:", decodedAccess.orgAllowedNavRoutes);
    console.log("  - orgPermissions:", decodedAccess.orgPermissions);

    if (decodedAccess.orgRoleName !== "Chapter Secretary Test") {
      throw new Error(`Expected orgRoleName 'Chapter Secretary Test', got ${decodedAccess.orgRoleName}`);
    }
    if (decodedAccess.orgPanelType !== "chapter-admin") {
      throw new Error(`Expected orgPanelType 'chapter-admin', got ${decodedAccess.orgPanelType}`);
    }
    if (!Array.isArray(decodedAccess.orgAllowedNavRoutes) || decodedAccess.orgAllowedNavRoutes.length !== 3) {
      throw new Error("Expected orgAllowedNavRoutes to have 3 permitted routes");
    }

    // Verify DB user role was NOT modified
    const dbUserAfterSwitch = await User.findById(testUser._id);
    console.log("User role in DB after switch:", dbUserAfterSwitch.role);
    if (dbUserAfterSwitch.role !== testUser.role) {
      throw new Error(`CRITICAL: User role was altered in DB! Expected ${testUser.role}, got ${dbUserAfterSwitch.role}`);
    }
    console.log(">>> PASS: User DB role preserved intact (no identity corruption)!\n");

    // 7. Test getMe when in Org Role session
    console.log("--- Testing getMe with active org session claims ---");
    const orgSessionMe = await authService.getMe(testUser._id, "chapter_admin", decodedAccess);
    console.log("Active workspace reflected:", orgSessionMe.activeWorkspace);
    console.log("Session role reflected:", orgSessionMe.role);

    if (orgSessionMe.activeWorkspace?.type !== "org_role" || orgSessionMe.activeWorkspace?.roleName !== "Chapter Secretary Test") {
      throw new Error("getMe did not reflect active org role workspace");
    }
    if (orgSessionMe.role !== "chapter_admin") {
      throw new Error("getMe did not reflect chapter_admin session role for panel guards");
    }
    console.log(">>> PASS: Session correctly reflects org role and panel access!\n");

    // 8. Test refreshToken preserves org claims
    console.log("--- Testing refreshToken persistence ---");
    const refreshedTokens = await authService.refreshToken(switchResult.refreshToken);
    const decodedRefreshed = jwt.decode(refreshedTokens.accessToken);
    console.log("Decoded Refreshed Access Token Claims:");
    console.log("  - orgWorkspaceId:", decodedRefreshed.orgWorkspaceId);
    console.log("  - orgRoleName:", decodedRefreshed.orgRoleName);
    console.log("  - orgPanelType:", decodedRefreshed.orgPanelType);

    if (decodedRefreshed.orgWorkspaceId !== String(roleAssignment._id) || decodedRefreshed.orgRoleName !== "Chapter Secretary Test") {
      throw new Error("refreshToken did not preserve org role claims");
    }
    console.log(">>> PASS: refreshToken preserved all org claims across refresh!\n");

    // 9. Test switchRole back to base business workspace
    console.log("--- Testing switchRole back to base business workspace ---");
    const switchBackResult = await authService.switchRole(testUser._id, "business_owner", null);
    const decodedBack = jwt.decode(switchBackResult.accessToken);
    console.log("Switched back token claims:");
    console.log("  - role:", decodedBack.role);
    console.log("  - orgWorkspaceId:", decodedBack.orgWorkspaceId);

    if (decodedBack.orgWorkspaceId !== undefined) {
      throw new Error("orgWorkspaceId should be undefined when switched back to business");
    }
    console.log(">>> PASS: Switched back to business workspace cleanly!\n");

    console.log("=================================================");
    console.log("ALL RBAC END-TO-END SYSTEM TESTS PASSED PERFECTLY!");
    console.log("=================================================");

    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    await disconnectDatabase();
    process.exit(1);
  }
}

runTest();

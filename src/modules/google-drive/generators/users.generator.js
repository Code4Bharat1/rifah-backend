import ExcelJS from "exceljs";
import { User } from "../../users/user.model.js";
import { applyWorksheetStyles, formatSafeDate } from "./generator-styles.js";

/**
 * Generates the RIFAH_Users.xlsx Excel workbook
 */
export async function generateUsersWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RIFAH Chamber Platform";
  workbook.lastModifiedBy = "RIFAH Sync Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Users Roster");

  worksheet.columns = [
    { header: "User ID", key: "id", width: 26 },
    { header: "Full Name", key: "name", width: 26 },
    { header: "Email Address", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "WhatsApp", key: "whatsapp", width: 18 },
    { header: "Role", key: "role", width: 18 },
    { header: "Account Type", key: "accountType", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Chapter", key: "chapter", width: 20 },
    { header: "State", key: "state", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "Organization", key: "organization", width: 26 },
    { header: "Business Name", key: "businessName", width: 26 },
    { header: "Designation", key: "designation", width: 20 },
    { header: "Category", key: "category", width: 20 },
    { header: "Sub-Category", key: "subCategory", width: 20 },
    { header: "Membership Plan", key: "membershipPlan", width: 18 },
    { header: "Profile Complete", key: "isProfileComplete", width: 16 },
    { header: "Joining Date", key: "joiningDate", width: 20 },
    { header: "Created Date", key: "createdAt", width: 20 },
    { header: "Last Updated", key: "updatedAt", width: 20 },
  ];

  const users = await User.find({})
    .sort({ createdAt: -1 })
    .lean();

  users.forEach((u) => {
    worksheet.addRow({
      id: String(u._id),
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      whatsapp: u.whatsapp || "",
      role: u.role || "customer",
      accountType: u.accountType || "customer",
      status: u.status || "active",
      chapter: u.chapter || "",
      state: u.state || "",
      country: u.country || "India",
      organization: u.organization || "",
      businessName: u.businessName || "",
      designation: u.designation || u.roleInBusiness || "",
      category: u.category || "",
      subCategory: u.subCategory || "",
      membershipPlan: u.subscriberTier || u.membershipPlan || "Free",
      isProfileComplete: u.isProfileComplete ? "Yes" : "No",
      joiningDate: formatSafeDate(u.joiningDate),
      createdAt: formatSafeDate(u.createdAt),
      updatedAt: formatSafeDate(u.updatedAt),
    });
  });

  applyWorksheetStyles(worksheet, "0F766E"); // Teal-700 header

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: "RIFAH_Users.xlsx",
    rowCount: users.length,
  };
}

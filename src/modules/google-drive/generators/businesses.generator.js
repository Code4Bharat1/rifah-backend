import ExcelJS from "exceljs";
import { Business } from "../../businesses/business.model.js";
import { applyWorksheetStyles, formatSafeDate } from "./generator-styles.js";

/**
 * Generates the RIFAH_Businesses.xlsx Excel workbook
 */
export async function generateBusinessesWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RIFAH Chamber Platform";
  workbook.lastModifiedBy = "RIFAH Sync Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Businesses Directory");

  worksheet.columns = [
    { header: "Business ID", key: "id", width: 26 },
    { header: "Business Name", key: "name", width: 32 },
    { header: "Slug", key: "slug", width: 24 },
    { header: "Owner Name", key: "ownerName", width: 24 },
    { header: "Owner Email", key: "ownerEmail", width: 28 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "WhatsApp", key: "whatsapp", width: 18 },
    { header: "Chapter", key: "chapter", width: 20 },
    { header: "State", key: "state", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "Industry", key: "industry", width: 22 },
    { header: "Primary Category", key: "primaryCategory", width: 22 },
    { header: "All Categories", key: "categories", width: 30 },
    { header: "Business Type", key: "businessType", width: 20 },
    { header: "Status", key: "status", width: 16 },
    { header: "Verification", key: "verification", width: 18 },
    { header: "GSTIN", key: "gstin", width: 20 },
    { header: "Membership Tier", key: "membershipTier", width: 18 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: "Rating", key: "rating", width: 12 },
    { header: "Reviews Count", key: "reviewsCount", width: 14 },
    { header: "Founded", key: "founded", width: 14 },
    { header: "Website", key: "website", width: 26 },
    { header: "Address", key: "address", width: 35 },
    { header: "Pincode", key: "pincode", width: 14 },
    { header: "Registered Date", key: "createdAt", width: 20 },
    { header: "Last Updated", key: "updatedAt", width: 20 },
  ];

  const businesses = await Business.find({})
    .populate("owner", "name email phone")
    .sort({ createdAt: -1 })
    .lean();

  businesses.forEach((b) => {
    worksheet.addRow({
      id: String(b._id),
      name: b.name || "",
      slug: b.slug || "",
      ownerName: b.owner?.name || b.contactPerson || "",
      ownerEmail: b.owner?.email || b.ownerEmail || b.email || "",
      phone: b.phone || b.owner?.phone || "",
      whatsapp: b.whatsapp || b.whatsappNumber || "",
      chapter: b.chapter || "",
      state: b.state || "",
      country: b.country || "India",
      industry: b.industry || "",
      primaryCategory: b.categories?.[0] || "",
      categories: Array.isArray(b.categories) ? b.categories.join(", ") : "",
      businessType: b.businessType || "Proprietorship",
      status: b.status || "Active",
      verification: b.verification || "unverified",
      gstin: b.gstin || b.taxId || "",
      membershipTier: b.subscriberTier || b.membership || "Free",
      paymentStatus: b.paymentStatus || "Pending",
      rating: typeof b.rating === "number" ? Number(b.rating.toFixed(1)) : 0,
      reviewsCount: b.reviewsCount || 0,
      founded: b.founded || "",
      website: b.website || "",
      address: [b.address, b.city].filter(Boolean).join(", "),
      pincode: b.pincode || "",
      createdAt: formatSafeDate(b.createdAt),
      updatedAt: formatSafeDate(b.updatedAt),
    });
  });

  applyWorksheetStyles(worksheet, "1E293B"); // Slate-800 dark header

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: "RIFAH_Businesses.xlsx",
    rowCount: businesses.length,
  };
}

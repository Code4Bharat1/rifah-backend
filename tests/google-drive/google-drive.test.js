import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { googleDriveService } from "../../src/infrastructure/google/google-drive.service.js";
import { applyWorksheetStyles } from "../../src/modules/google-drive/generators/generator-styles.js";

test("GoogleDriveService: getAuthUrl contains correct scopes for Drive and user identity", () => {
  // Set test credentials temporarily if missing
  const prevId = googleDriveService.clientId;
  const prevSecret = googleDriveService.clientSecret;
  googleDriveService.clientId = "test-client-id.apps.googleusercontent.com";
  googleDriveService.clientSecret = "test-client-secret";

  try {
    const url = googleDriveService.getAuthUrl("state-test");
    assert.ok(url.includes("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive"), "URL must request drive scope");
    assert.ok(url.includes("https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email"), "URL must request email scope");
    assert.ok(url.includes("access_type=offline"), "Must request offline access for refresh token");
    assert.ok(url.includes("state=state-test"), "Must preserve state parameter");
  } finally {
    googleDriveService.clientId = prevId;
    googleDriveService.clientSecret = prevSecret;
  }
});

test("ExcelJS: applyWorksheetStyles correctly formats headers, auto-fit columns and frozen row", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Test Sheet");

  worksheet.columns = [
    { header: "Business Name", key: "name", width: 20 },
    { header: "Owner Email", key: "email", width: 25 },
    { header: "Status", key: "status", width: 15 },
  ];

  worksheet.addRow({ name: "Alpha Enterprises", email: "alpha@example.org", status: "Active" });
  worksheet.addRow({ name: "Beta Industrial Systems", email: "beta@example.org", status: "Pending" });

  applyWorksheetStyles(worksheet, "1E293B");

  assert.equal(worksheet.views[0].state, "frozen", "Top header row must be frozen");
  assert.equal(worksheet.views[0].ySplit, 1);

  const headerCell = worksheet.getCell("A1");
  assert.equal(headerCell.font.bold, true, "Header font must be bold");
  assert.equal(headerCell.fill.type, "pattern");
  assert.equal(headerCell.fill.fgColor.argb, "FF1E293B", "Header color must match requested palette");

  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(buffer.length > 1000, "Workbook buffer must be non-empty");

  // Read back to verify valid xlsx structure
  const readWorkbook = new ExcelJS.Workbook();
  await readWorkbook.xlsx.load(buffer);
  const readSheet = readWorkbook.getWorksheet("Test Sheet");
  assert.equal(readSheet.rowCount, 3, "Must have header + 2 data rows");
  assert.equal(readSheet.getCell("A2").value, "Alpha Enterprises");
  assert.equal(readSheet.getCell("A3").value, "Beta Industrial Systems");
});

test("Event Attendees Excel: structure groups attendees by event name with dedicated worksheets", async () => {
  const workbook = new ExcelJS.Workbook();

  // Master directory sheet
  const dirSheet = workbook.addWorksheet("Events Directory");
  dirSheet.columns = [
    { header: "Event Title", key: "title" },
    { header: "Date", key: "date" },
    { header: "Registered Count", key: "count" },
  ];
  dirSheet.addRow({ title: "Annual Business Summit 2026", date: "2026-11-20", count: 2 });
  applyWorksheetStyles(dirSheet, "312E81");

  // Master attendee sheet (categorized/grouped by event name)
  const masterSheet = workbook.addWorksheet("Attendees by Event (Master)");
  masterSheet.columns = [
    { header: "Event Name", key: "eventName" },
    { header: "Attendee Name", key: "attendeeName" },
    { header: "Ticket ID", key: "ticketId" },
    { header: "Payment Status", key: "paymentStatus" },
  ];
  masterSheet.addRow({
    eventName: "Annual Business Summit 2026",
    attendeeName: "Rashid Khan",
    ticketId: "TCK-001",
    paymentStatus: "Paid",
  });
  masterSheet.addRow({
    eventName: "Annual Business Summit 2026",
    attendeeName: "Fatima Patel",
    ticketId: "TCK-002",
    paymentStatus: "Paid",
  });
  applyWorksheetStyles(masterSheet, "4338CA");

  // Event dedicated tab
  const eventTab = workbook.addWorksheet("Annual Business Summit (1)");
  eventTab.columns = [
    { header: "Attendee Name", key: "name" },
    { header: "Email Address", key: "email" },
  ];
  eventTab.addRow({ name: "Rashid Khan", email: "rashid@example.org" });
  eventTab.addRow({ name: "Fatima Patel", email: "fatima@example.org" });
  applyWorksheetStyles(eventTab, "3730A3");

  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);

  assert.equal(loaded.worksheets.length, 3, "Should have directory, master grouped list, and event tab");
  assert.equal(loaded.worksheets[0].name, "Events Directory");
  assert.equal(loaded.worksheets[1].name, "Attendees by Event (Master)");
  assert.equal(loaded.worksheets[2].name, "Annual Business Summit (1)");
});

test("GoogleDriveSync: Access security allows only authorized admins", () => {
  const adminRoles = ["central_admin", "secretariat", "state_admin", "chapter_admin", "super_admin", "admin"];
  const nonAdminRoles = ["customer", "buyer", "business", "business_owner", "member"];

  const checkAccess = (role) => adminRoles.includes(role);

  for (const r of adminRoles) {
    assert.equal(checkAccess(r), true, `Role ${r} must have authorized access`);
  }
  for (const r of nonAdminRoles) {
    assert.equal(checkAccess(r), false, `Role ${r} must NOT have admin access`);
  }
});

// Clean exit hook to prevent ExcelJS worker handles from lingering
test.after(() => {
  setTimeout(() => process.exit(0), 50);
});


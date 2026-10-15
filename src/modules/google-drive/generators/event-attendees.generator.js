import ExcelJS from "exceljs";
import { Event } from "../../events/event.model.js";
import { applyWorksheetStyles, formatSafeDate } from "./generator-styles.js";

/**
 * Sanitizes an event title into an Excel-valid sheet name (max 31 chars, no invalid characters)
 */
function sanitizeSheetName(name, index) {
  const clean = String(name || "Event")
    .replace(/[\\/?*[\]:]/g, "")
    .trim();
  const truncated = clean.substring(0, 24);
  return `${truncated || "Event"} (${index + 1})`.substring(0, 31);
}

/**
 * Generates the RIFAH_Event_Attendees.xlsx Excel workbook organized & categorized by event name
 */
export async function generateEventAttendeesWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "RIFAH Chamber Platform";
  workbook.lastModifiedBy = "RIFAH Sync Engine";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Fetch all events populated with registered users
  const events = await Event.find({})
    .populate("registeredUsers.user", "name email phone role chapter state businessName")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // --- SHEET 1: Master Events Directory ---
  const sheet1 = workbook.addWorksheet("Events Directory");
  sheet1.columns = [
    { header: "Event Title", key: "title", width: 32 },
    { header: "Slug", key: "slug", width: 24 },
    { header: "Date", key: "date", width: 14 },
    { header: "Time", key: "time", width: 14 },
    { header: "Venue", key: "venue", width: 30 },
    { header: "Chapter", key: "chapter", width: 20 },
    { header: "City", key: "city", width: 18 },
    { header: "Mode", key: "mode", width: 14 },
    { header: "Category", key: "eventCategory", width: 18 },
    { header: "Organizer", key: "organizer", width: 26 },
    { header: "Seats Limit", key: "totalSeats", width: 14 },
    { header: "Registered Count", key: "registeredCount", width: 18 },
    { header: "Ticket Price (₹)", key: "ticketPrice", width: 16 },
    { header: "Member Price (₹)", key: "memberPrice", width: 16 },
    { header: "Status", key: "status", width: 14 },
  ];

  events.forEach((ev) => {
    sheet1.addRow({
      title: ev.title || "",
      slug: ev.slug || "",
      date: ev.date || "",
      time: ev.time || "",
      venue: ev.venue || "",
      chapter: ev.chapter || "",
      city: ev.city || "",
      mode: ev.mode || "Offline",
      eventCategory: ev.eventCategory || "Meet",
      organizer: ev.organizer || "RIFAH Chamber",
      totalSeats: ev.totalSeats === 0 ? "Unlimited" : ev.totalSeats,
      registeredCount: ev.registeredUsers ? ev.registeredUsers.length : (ev.registeredCount || 0),
      ticketPrice: ev.isPaid ? (ev.ticketPrice || 0) : 0,
      memberPrice: ev.isPaid ? (ev.memberPrice || 0) : 0,
      status: ev.status || "Published",
    });
  });

  applyWorksheetStyles(sheet1, "312E81"); // Indigo-900 header

  // --- SHEET 2: Master Attendee Roster (Categorized & Grouped by Event Name) ---
  const sheet2 = workbook.addWorksheet("Attendees by Event (Master)");
  sheet2.columns = [
    { header: "Event Name", key: "eventName", width: 32 },
    { header: "Event Date", key: "eventDate", width: 14 },
    { header: "Attendee Name", key: "attendeeName", width: 26 },
    { header: "Attendee Email", key: "attendeeEmail", width: 28 },
    { header: "Attendee Phone", key: "attendeePhone", width: 18 },
    { header: "Chapter / Business", key: "chapterBusiness", width: 24 },
    { header: "Registration Role", key: "role", width: 16 },
    { header: "Registered At", key: "registeredAt", width: 20 },
    { header: "Ticket ID", key: "ticketId", width: 18 },
    { header: "Ticket Type", key: "ticketType", width: 18 },
    { header: "Ticket Status", key: "ticketStatus", width: 16 },
    { header: "Check-in Status", key: "checkedIn", width: 16 },
    { header: "Check-in Time", key: "checkedInAt", width: 20 },
    { header: "Attendance Status", key: "attendanceStatus", width: 18 },
    { header: "Payment Status", key: "paymentStatus", width: 16 },
    { header: "Amount Paid (₹)", key: "amountPaid", width: 16 },
    { header: "Payment ID", key: "paymentId", width: 22 },
  ];

  let totalAttendeesCount = 0;

  // Grouped iteration: Iterate event by event
  events.forEach((ev) => {
    const attendees = ev.registeredUsers || [];
    attendees.forEach((reg) => {
      totalAttendeesCount++;
      const user = reg.user || {};
      sheet2.addRow({
        eventName: ev.title || "Untitled Event",
        eventDate: ev.date || "",
        attendeeName: user.name || "Guest Attendee",
        attendeeEmail: user.email || "",
        attendeePhone: user.phone || "",
        chapterBusiness: [user.chapter, user.businessName].filter(Boolean).join(" · "),
        role: (reg.role || "guest").toUpperCase(),
        registeredAt: formatSafeDate(reg.registeredAt),
        ticketId: reg.ticketId || "",
        ticketType: reg.ticketType || (ev.isPaid ? "Paid Pass" : "Complimentary Pass"),
        ticketStatus: reg.ticketStatus || "Confirmed",
        checkedIn: reg.checkedIn ? "Checked In" : "Pending",
        checkedInAt: formatSafeDate(reg.checkedInAt),
        attendanceStatus: reg.attendanceStatus || (reg.checkedIn ? "Present" : "Pending"),
        paymentStatus: reg.paymentStatus || (ev.isPaid ? "Pending" : "Free"),
        amountPaid: Number(reg.amountPaid) || 0,
        paymentId: reg.paymentId || reg.transactionId || "",
      });
    });
  });

  applyWorksheetStyles(sheet2, "4338CA"); // Indigo-700 header

  // --- DEDICATED SHEETS (Up to 25 most recent events with attendees) ---
  const eventsWithAttendees = events.filter((ev) => ev.registeredUsers && ev.registeredUsers.length > 0).slice(0, 25);

  eventsWithAttendees.forEach((ev, idx) => {
    const sheetName = sanitizeSheetName(ev.title, idx);
    const eventSheet = workbook.addWorksheet(sheetName);

    eventSheet.columns = [
      { header: "Attendee Name", key: "name", width: 26 },
      { header: "Email Address", key: "email", width: 28 },
      { header: "Phone", key: "phone", width: 18 },
      { header: "Chapter", key: "chapter", width: 20 },
      { header: "Role", key: "role", width: 14 },
      { header: "Registration Date", key: "regDate", width: 18 },
      { header: "Ticket ID", key: "ticketId", width: 16 },
      { header: "Check-in Status", key: "checkedIn", width: 16 },
      { header: "Check-in Time", key: "checkedInAt", width: 20 },
      { header: "Payment Status", key: "paymentStatus", width: 16 },
      { header: "Amount Paid (₹)", key: "amountPaid", width: 16 },
    ];

    ev.registeredUsers.forEach((reg) => {
      const u = reg.user || {};
      eventSheet.addRow({
        name: u.name || "Guest Attendee",
        email: u.email || "",
        phone: u.phone || "",
        chapter: u.chapter || "",
        role: (reg.role || "guest").toUpperCase(),
        regDate: formatSafeDate(reg.registeredAt, false),
        ticketId: reg.ticketId || "",
        checkedIn: reg.checkedIn ? "Checked In" : "Pending",
        checkedInAt: formatSafeDate(reg.checkedInAt),
        paymentStatus: reg.paymentStatus || (ev.isPaid ? "Pending" : "Free"),
        amountPaid: Number(reg.amountPaid) || 0,
      });
    });

    applyWorksheetStyles(eventSheet, "3730A3"); // Indigo-800 header
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    fileName: "RIFAH_Event_Attendees.xlsx",
    rowCount: totalAttendeesCount,
    eventsCount: events.length,
  };
}

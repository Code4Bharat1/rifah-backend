import ExcelJS from "exceljs";
import { OAuth2Client } from "google-auth-library";

console.log("ExcelJS Workbook:", typeof ExcelJS.Workbook);
console.log("OAuth2Client:", typeof OAuth2Client);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Test");
sheet.columns = [
  { header: "Name", key: "name", width: 20 },
  { header: "Email", key: "email", width: 30 }
];
sheet.addRow({ name: "Admin Test", email: "admin@rifah.org" });

workbook.xlsx.writeBuffer().then(buffer => {
  console.log("Workbook generated buffer size:", buffer.length);
  process.exit(0);
}).catch(err => {
  console.error("Error generating workbook:", err);
  process.exit(1);
});

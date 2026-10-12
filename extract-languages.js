import ExcelJS from "exceljs";

async function extract() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("f:\\Rifah\\Rifah_Top_100_Muslim_Countries_Language_Priority.xlsx");
  const worksheet = workbook.worksheets[0];
  
  const langs = [];
  worksheet.eachRow((row, i) => {
    // maybe column 2 is the languages?
    langs.push(row.getCell(2).value);
  });
  console.log(langs.slice(0, 50));
}

extract().catch(console.error);

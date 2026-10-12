import ExcelJS from "exceljs";

async function readExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("f:\\Rifah\\Rifah_Top_100_Muslim_Countries_Language_Priority.xlsx");
  const worksheet = workbook.worksheets[0];
  
  const languages = [];
  worksheet.eachRow((row, rowNumber) => {
    // Assuming language name is in column A or B. Let's just print the row values.
    languages.push(row.values);
  });
  
  console.log(JSON.stringify(languages, null, 2));
}

readExcel().catch(console.error);

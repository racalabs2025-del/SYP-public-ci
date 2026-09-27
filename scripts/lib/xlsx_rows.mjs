import readExcelFile from 'read-excel-file/node';

export async function readSheetObjects(file, sheetName = 'Veri') {
  const sheets = await readExcelFile(file);
  const sheet = sheets.find((item) => item.sheet === sheetName);
  if (!sheet) throw new Error(`${file}: ${sheetName} sayfası bulunamadı.`);
  const [headers = [], ...rows] = sheet.data;
  return rows
    .filter((row) => row.some((value) => value !== null && value !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? ''])));
}

export function objectsToRows(objects) {
  const headers = Object.keys(objects[0] || {});
  return [headers, ...objects.map((object) => headers.map((header) => object[header] ?? ''))];
}

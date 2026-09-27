function asArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
}

async function assertFormulaFree(buffer) {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(asArrayBuffer(buffer)));
  for (const [path, contents] of Object.entries(files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path) && /<f(?:\s|>)/i.test(strFromU8(contents))) {
      throw new Error('Veri sayfasında formül kullanmayın; hesaplanmış değerleri yapıştırın.');
    }
  }
}

export async function loadWorkbookSheets(buffer) {
  await assertFormulaFree(buffer);
  const { default: readExcelFile } = await import('read-excel-file/universal');
  return readExcelFile(asArrayBuffer(buffer));
}

export async function downloadWorkbook(sheets, filename) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const workbook = sheets.map(({ name, rows, widths = [] }) => ({
    data: rows,
    sheet: name,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
  }));
  await writeExcelFile(workbook).toFile(filename);
}

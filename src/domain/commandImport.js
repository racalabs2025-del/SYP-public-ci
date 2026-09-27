import { KINDS, LABELS } from './commandCenter.js';
import { loadWorkbookSheets } from '../lib/excelWorkbook.js';

const dateFields = new Set(['tarih', 'hedefTarih', 'teyitTarihi']);
const timeFields = new Set(['baslangic', 'bitis']);
const textIdentifierFields = new Set(['personelId', 'recordId', 'telefon']);

function excelDate(value, rowNumber) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value !== 'number') return value;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
  if (Number.isNaN(date.getTime())) throw new Error(`${rowNumber}. satırda geçersiz tarih.`);
  return date.toISOString().slice(0, 10);
}

function excelTime(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof value !== 'number' || value < 0 || value >= 1) return value;
  const minutes = Math.round(value * 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function plainCellValue(cell) {
  const value = cell;
  if (value == null) return '';
  return value;
}

export async function readCommandWorkbook(buffer, kind, customFields = []) {
  const sheets = await loadWorkbookSheets(buffer);
  const sheet = sheets.find((item) => item.sheet === 'Veri');
  if (!sheet) throw new Error('Şablondaki Veri sayfası bulunamadı. İlgili şablonu indirin.');
  const headers = (sheet.data[0] || []).map((value) => String(plainCellValue(value)).trim());
  const matches = (fields) => {
    const expected = [...fields.map((field) => LABELS[field]), ...customFields.map((field) => field.label)];
    return headers.length === expected.length && headers.every((header, index) => header === expected[index]);
  };
  const currentFields = KINDS[kind].fields;
  const previousFields = currentFields.filter((field) => field !== 'cozumNoktasiId');
  const legacyPlanFields = kind === 'plans' ? previousFields.filter((field) => !['planKapsami', 'kapsamAdi'].includes(field)) : previousFields;
  const fields = matches(currentFields) ? currentFields : matches(previousFields) ? previousFields : matches(legacyPlanFields) ? legacyPlanFields : null;
  if (!fields) throw new Error('Sütunlar bu veri türünün şablonuyla eşleşmiyor. Başlıkları ve sıralarını değiştirmeyin.');
  if (Math.max(0, sheet.data.length - 1) > 500) throw new Error('Bir yüklemede en fazla 500 satır kullanın.');
  const used = [];
  for (let rowNumber = 2; rowNumber <= sheet.data.length; rowNumber += 1) {
    const row = sheet.data[rowNumber - 1] || [];
    const cells = headers.map((_, index) => row[index]);
    if (cells.some((cell) => String(plainCellValue(cell)).trim())) used.push({ rowNumber, cells });
  }
  if (!used.length) throw new Error('Dosyada doldurulmuş kayıt yok.');
  return used.map(({ rowNumber, cells }) => { const record = Object.fromEntries(fields.map((h, col) => {
    let value = plainCellValue(cells[col]);
    if (dateFields.has(h)) value = excelDate(value, rowNumber);
    else if (timeFields.has(h)) value = excelTime(value);
    else if (typeof value === 'number' && textIdentifierFields.has(h)) throw new Error(`${rowNumber}. satır: ${h} metin olarak girilmeli; baştaki sıfırlar korunmalıdır.`);
    return [h, String(value).trim()];
  }));
  if (currentFields.includes('cozumNoktasiId') && !fields.includes('cozumNoktasiId')) record.cozumNoktasiId = '';
  if (kind === 'plans' && !fields.includes('planKapsami')) { record.planKapsami = 'ILCE'; record.kapsamAdi = ''; }
  if (kind === 'personnel') record.ozelAlanlar = Object.fromEntries(customFields.map((field, offset) => [field.id, String(plainCellValue(cells[fields.length + offset])).trim()]));
  return { __sheetRow: rowNumber, ...record }; });
}

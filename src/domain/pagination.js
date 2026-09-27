export async function collectAllPages(loadPage, pageSize) {
  if (typeof loadPage !== 'function') throw new TypeError('loadPage bir fonksiyon olmalıdır.');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('pageSize pozitif bir tam sayı olmalıdır.');

  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await loadPage(offset, pageSize);
    if (!Array.isArray(page)) throw new TypeError('Sayfa sorgusu bir dizi döndürmelidir.');
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

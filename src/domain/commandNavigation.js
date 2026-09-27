const CONTENT_TABS = [
  ['plans', 'Birim planı ve personel'],
  ['activities', 'Çalışmalar'],
  ['tasks', 'Takip edilen işler'],
];

export function commandTabs(unit) {
  if (!unit || unit === 'MEYDAN') return [...CONTENT_TABS, ['squares', 'Meydanlar']];
  if (unit === 'COZUM_NOKTALARI') return [...CONTENT_TABS, ['points', 'Çözüm noktaları']];
  return CONTENT_TABS;
}

export function normalizeCommandTab(requestedTab, mode, unit) {
  if (commandTabs(unit).some(([id]) => id === requestedTab)) return requestedTab;
  if (mode === 'unit' && unit === 'MEYDAN') return 'squares';
  if (mode === 'unit' && unit === 'COZUM_NOKTALARI') return 'points';
  return 'plans';
}

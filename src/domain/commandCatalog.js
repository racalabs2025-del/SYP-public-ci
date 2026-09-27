import { ALL_CANONICAL_MEYDANLAR } from '../data/canonicalMeydanData.js';
import { ISTANBUL_DISTRICTS_DATA } from '../data/istanbulDistrictsData.js';
import { normalizeText } from './commandCenter.js';
export const squares = ALL_CANONICAL_MEYDANLAR.map((s) => ({ ...s, districtId: ISTANBUL_DISTRICTS_DATA.find((d) => normalizeText(d.name) === normalizeText(s.district))?.id || '' }));
export function adaptPlan(p) {
  const squareId = p.meydanId || (p.lokasyonIds?.length === 1 ? p.lokasyonIds[0] : '') || (squares.some((s) => s.id === p.id) ? p.id : '');
  const square = squares.find((s) => s.id === squareId);
  const hours = String(p.saatAraligi || p.saat || '').match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  return { ...p, recordId: p.recordId || p.id, tarih: p.tarih || p.baslangicTarihi || '', personelId: p.personelId || '', adSoyad: p.adSoyad || p.personelAdiSnapshot || p.personelAdi || p.personelAd || p.personel || '', birimId: p.birimId || (square ? 'MEYDAN' : ''), ilceId: p.ilceId || square?.districtId || (p.ilceIds?.length === 1 ? p.ilceIds[0] : ''), mahalleId: p.mahalleId || '', meydanId: squareId, gorevYeri: p.gorevYeri || square?.name || '', baslangic: (p.baslangic || p.baslangicSaati || hours?.[1] || '').trim(), bitis: (p.bitis || p.bitisSaati || hours?.[2] || '').trim(), ekip: p.ekip || p.ekipId || '' };
}

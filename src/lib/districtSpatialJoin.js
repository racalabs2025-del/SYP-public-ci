/**
 * SYP — İlçe Spatial Join Motoru & Coğrafi Yardımcılar
 * Faz 6.3: İBB Varlıkları + Ulaşım Veri Paketi
 * 
 * Özellikler:
 * 1. 39 resmi ilçe poligonu üzerinde ray-casting nokta-poligon kontrolü.
 * 2. İstanbul koordinat sınırları (Sanity Bounds) denetimi.
 * 3. Kıyı şeridi toleransı (Coastal Buffer) ve sınır belirsizliği (AMBIGUOUS) tespiti.
 * 4. İBB CBS ITRF96 / TM30 (Meridyen 30°) -> WGS84 koordinat dönüşümü.
 * 5. WGS84 jeodezik poligon alanı (m²) hesaplaması.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const ISTANBUL_BOUNDS = {
  minLat: 40.75,
  maxLat: 41.65,
  minLon: 27.90,
  maxLon: 30.00,
};

function slugify(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

let cachedDistricts = null;

/**
 * 39 İlçe Poligonlarını Yükle ve Bounding Box İndeksle
 */
export function loadDistrictPolygons(customGeojson = null) {
  if (cachedDistricts && !customGeojson) {
    return cachedDistricts;
  }

  let geojson = customGeojson;
  if (!geojson) {
    const filePath = path.resolve(ROOT_DIR, 'data/source-evidence/istanbul-districts.json');
    if (fs.existsSync(filePath)) {
      geojson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      throw new Error(`Kanonik ilçe poligon dosyası bulunamadı: ${filePath}`);
    }
  }

  cachedDistricts = geojson.features.map((f) => {
    const slug = slugify(f.properties.name);
    let minLon = 100, maxLon = -100, minLat = 100, maxLat = -100;
    function walk(c) {
      if (typeof c[0] === 'number') {
        if (c[0] < minLon) minLon = c[0];
        if (c[0] > maxLon) maxLon = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      } else {
        c.forEach(walk);
      }
    }
    walk(f.geometry.coordinates);

    return {
      id: slug,
      name: f.properties.name,
      bbox: { minLon, maxLon, minLat, maxLat },
      geomType: f.geometry.type,
      coordinates: f.geometry.coordinates,
    };
  });

  return cachedDistricts;
}

/**
 * Ray-Casting ile Halka İçi Nokta Kontrolü
 */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Poligon veya MultiPoligon İçi Nokta Kontrolü (Delik/Hole Destekli)
 */
function pointInGeom(lon, lat, geomType, coords) {
  if (geomType === 'Polygon') {
    if (!pointInRing(lon, lat, coords[0])) return false;
    for (let k = 1; k < coords.length; k++) {
      if (pointInRing(lon, lat, coords[k])) return false;
    }
    return true;
  } else if (geomType === 'MultiPolygon') {
    for (const poly of coords) {
      if (pointInRing(lon, lat, poly[0])) {
        let inHole = false;
        for (let k = 1; k < poly.length; k++) {
          if (pointInRing(lon, lat, poly[k])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * Nokta ile Çizgi Parçası Arasındaki Metrik Mesafe (Metre)
 */
function distToSegmentMeters(lon, lat, lon1, lat1, lon2, lat2) {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lon * cosLat * 111320;
  const py = lat * 110540;
  const x1 = lon1 * cosLat * 111320;
  const y1 = lat1 * 110540;
  const x2 = lon2 * cosLat * 111320;
  const y2 = lat2 * 110540;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(px - x1, py - y1);
  const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (mag * mag)));
  const ix = x1 + u * dx;
  const iy = y1 + u * dy;
  return Math.hypot(px - ix, py - iy);
}

/**
 * Nokta ile Poligon Sınırı Arasındaki En Kısa Mesafe (Metre)
 */
function distToGeom(lon, lat, geomType, coords) {
  let minDist = Infinity;
  function checkRing(ring) {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distToSegmentMeters(lon, lat, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      if (d < minDist) minDist = d;
    }
  }
  if (geomType === 'Polygon') {
    coords.forEach(checkRing);
  } else if (geomType === 'MultiPolygon') {
    coords.forEach((p) => p.forEach(checkRing));
  }
  return minDist;
}

/**
 * Noktanın İlçe Aidiyetini Çözümle
 * 
 * @param {number} lat - WGS84 Enlem (Örn: 41.0082)
 * @param {number} lon - WGS84 Boylam (Örn: 28.9784)
 * @param {object} options - { coastalBufferMeters = 300, ambiguityThresholdMeters = 35 }
 * @returns {object} { districtId, districtName, status, method, distanceMeters, candidates }
 */
export function resolveDistrictForPoint(lat, lon, options = {}) {
  const coastalBuffer = options.coastalBufferMeters || 300;
  const ambiguityThreshold = options.ambiguityThresholdMeters || 35;

  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return { districtId: null, status: 'INVALID_COORDINATES' };
  }

  // 1. İstanbul Koordinat Sınırları Kontrolü
  if (
    lat < ISTANBUL_BOUNDS.minLat ||
    lat > ISTANBUL_BOUNDS.maxLat ||
    lon < ISTANBUL_BOUNDS.minLon ||
    lon > ISTANBUL_BOUNDS.maxLon
  ) {
    return { districtId: null, status: 'OUT_OF_BOUNDS' };
  }

  const districts = loadDistrictPolygons();

  // 2. Kesin Poligon İçi Kontrolü
  for (const d of districts) {
    if (lon < d.bbox.minLon || lon > d.bbox.maxLon || lat < d.bbox.minLat || lat > d.bbox.maxLat) {
      continue;
    }
    if (pointInGeom(lon, lat, d.geomType, d.coordinates)) {
      return {
        districtId: d.id,
        districtName: d.name,
        status: 'RESOLVED',
        method: 'EXACT_POLYGON',
      };
    }
  }

  // 3. Kıyı Şeridi / Sahil Tamponu Kontrolü
  const candidates = [];
  for (const d of districts) {
    // Genişletilmiş bounding box filtresi
    const lonBufferDeg = coastalBuffer / (111320 * Math.cos((lat * Math.PI) / 180));
    const latBufferDeg = coastalBuffer / 110540;
    if (
      lon < d.bbox.minLon - lonBufferDeg ||
      lon > d.bbox.maxLon + lonBufferDeg ||
      lat < d.bbox.minLat - latBufferDeg ||
      lat > d.bbox.maxLat + latBufferDeg
    ) {
      continue;
    }

    const dist = distToGeom(lon, lat, d.geomType, d.coordinates);
    if (dist <= coastalBuffer) {
      candidates.push({ districtId: d.id, districtName: d.name, dist });
    }
  }

  if (candidates.length === 0) {
    return { districtId: null, status: 'UNRESOLVED' };
  }

  candidates.sort((a, b) => a.dist - b.dist);

  // Belirsizlik / Ambiguity Kontrolü: En yakın 2 ilçe arasındaki mesafe farkı çok küçükse
  if (candidates.length > 1 && Math.abs(candidates[0].dist - candidates[1].dist) < ambiguityThreshold) {
    return {
      districtId: null,
      status: 'AMBIGUOUS',
      candidates: candidates.slice(0, 2),
      note: `İlçe sınırı veya boğaz hattında belirsiz koordinat: ${candidates[0].districtName} (${Math.round(candidates[0].dist)}m) / ${candidates[1].districtName} (${Math.round(candidates[1].dist)}m)`,
    };
  }

  return {
    districtId: candidates[0].districtId,
    districtName: candidates[0].districtName,
    status: 'RESOLVED',
    method: 'COASTLINE_BUFFER',
    distanceMeters: Math.round(candidates[0].dist),
  };
}

/**
 * İBB CBS ITRF96 / TM30 (Meridyen 30°, Transverse Mercator, EPSG:5256) -> WGS84 (Lat, Lon) Dönüşümü
 * Kanıtlanmış parametreler:
 * Datum: GRS80 / WGS84 (a = 6378137, f = 1/298.257222101)
 * Central Meridian: 30°
 * Scale factor: 1.0 (3 derecelik dilim)
 * False Easting: 500,000 m, False Northing: 0 m
 */
export function itrf96Tm30ToWgs84(easting, northing) {
  if (typeof easting !== 'number' || typeof northing !== 'number' || isNaN(easting) || isNaN(northing)) {
    return { latitude: null, longitude: null, valid: false };
  }

  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 1.0;
  const e = Math.sqrt(2 * f - f * f);
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));

  const x = easting - 500000;
  const y = northing;
  const m = y / k0;
  const mu = m / (a * (1 - (e * e) / 4 - (3 * Math.pow(e, 4)) / 64 - (5 * Math.pow(e, 6)) / 256));

  const phi1Rad = mu
    + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);

  const ep2 = (e * e) / (1 - e * e);
  const c1 = ep2 * Math.pow(Math.cos(phi1Rad), 2);
  const t1 = Math.pow(Math.tan(phi1Rad), 2);
  const r1 = a * (1 - e * e) / Math.pow(1 - e * e * Math.pow(Math.sin(phi1Rad), 2), 1.5);
  const n1 = a / Math.sqrt(1 - e * e * Math.pow(Math.sin(phi1Rad), 2));
  const d = x / (n1 * k0);

  const latRad = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (
    (d * d) / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * Math.pow(d, 4) / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * Math.pow(d, 6) / 720
  );

  const lonRad = (
    d
    - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * Math.pow(d, 5) / 120
  ) / Math.cos(phi1Rad);

  const lat = (latRad * 180) / Math.PI;
  const lon = 30 + (lonRad * 180) / Math.PI; // CM = 30°

  const valid = lat >= ISTANBUL_BOUNDS.minLat && lat <= ISTANBUL_BOUNDS.maxLat &&
                lon >= ISTANBUL_BOUNDS.minLon && lon <= ISTANBUL_BOUNDS.maxLon;

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    valid,
  };
}

/**
 * WGS84 Koordinatlı Poligonun Gerçek Yüzölçümünü (m²) Hesapla
 * Gauss Spherical Excess formülü
 */
export function calculatePolygonAreaM2(coords) {
  if (!coords || !Array.isArray(coords)) return 0;
  const rings = Array.isArray(coords[0][0]) ? coords : [coords];
  let totalArea = 0;

  const R = 6378137; // WGS84 dünya yarıçapı
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (ring.length < 3) continue;
    let ringArea = 0;
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % ring.length];
      const lon1Rad = (p1[0] * Math.PI) / 180;
      const lat1Rad = (p1[1] * Math.PI) / 180;
      const lon2Rad = (p2[0] * Math.PI) / 180;
      const lat2Rad = (p2[1] * Math.PI) / 180;
      ringArea += (lon2Rad - lon1Rad) * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad));
    }
    ringArea = Math.abs((ringArea * R * R) / 2);
    if (r === 0) totalArea += ringArea; // Dış sınır
    else totalArea -= ringArea; // İç delikler (holes)
  }

  return Math.max(0, Math.round(totalArea));
}

/**
 * İki Nokta Arasındaki Mesafeyi Hesapla (Haversine Metre)
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

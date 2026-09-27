// Otomatik üretilmiş Yüksek Çözünürlüklü 39 İstanbul İlçe Sınırları (GeoJSON -> SVG Path)
// Performance & Chunk Optimization: Anadolu ve Avrupa ayrı modüllere ayrıldı

import { anadoluGeoPaths } from './istanbulGeoJsonPathsAnadolu.js';
import { avrupaGeoPaths } from './istanbulGeoJsonPathsAvrupa.js';

export const geoPaths = {
  ...anadoluGeoPaths,
  ...avrupaGeoPaths,
};

export { anadoluGeoPaths, avrupaGeoPaths };

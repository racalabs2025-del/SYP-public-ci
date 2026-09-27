import { useState, useRef, useEffect, useMemo, useId } from 'react';
import './MapLayerSelector.css';

const MAP_LAYERS = [
  { id: 'Genel Operasyon Yoğunluğu', label: 'Genel Operasyon Yoğunluğu', shortLabel: 'Genel', icon: '🗺️', desc: 'İlçe bazlı genel saha hareketliliği ve yoğunluk skoru' },
  { id: 'Personel Yoğunluğu', label: 'Planlanan Personel', shortLabel: 'Personel', icon: '👥', desc: 'Seçili tarih aralığındaki tekil personel dağılımı' },
  { id: 'Gerçekleşen Çalışmalar', label: 'Gerçekleşen Çalışmalar', shortLabel: 'Çalışmalar', icon: '📝', desc: 'Seçili dönemde kaydedilen saha çalışmaları' },
  { id: 'Takip Edilen İşler', label: 'Takip Edilen İşler', shortLabel: 'İşler', icon: '📋', desc: 'Açık takip işleri' },
  { id: 'Başvuru Yoğunluğu', label: 'Başvuru Yoğunluğu', shortLabel: 'Başvurular', icon: '📬', desc: 'Çözüm merkezinden ve sahadan gelen vatandaş başvuruları' },
  { id: 'Aktif Operasyonlar', label: 'Görev Planları', shortLabel: 'Görevler', icon: '📅', desc: 'Seçili tarih aralığındaki görev kayıtları' },
  { id: 'Kronik Sorunlar', label: 'Takip Edilen İşler', shortLabel: 'Takip işleri', icon: '📋', desc: 'Merkezin kaydettiği bekleyen işler' },
  { id: 'Meydanlar', label: 'Meydanlar', shortLabel: 'Meydanlar', icon: '📍', desc: 'Meydan envanteri' },
  { id: 'Birim Aktivitesi', label: 'Birim Aktivitesi', shortLabel: 'Birimler', icon: '🏢', desc: 'İlçede aktif çalışan saha birimleri ve operasyonları' },
];

/**
 * Harita Sol Üst Katman Değiştirici (3D & 2.5D Haritalar İçin)
 * Pusula yerine yerleşir, aktif katmanı gösterir ve tıklandığında anında değiştirir.
 */
export default function MapLayerSelector({
  selectedLayer = 'Genel Operasyon Yoğunluğu',
  onSelectLayer = () => {},
  is3D = false,
  availableLayers,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listId = useId();
  const layers = useMemo(() => {
    const supported = availableLayers ? MAP_LAYERS.filter((layer) => availableLayers.includes(layer.id)) : MAP_LAYERS;
    return supported.length ? supported : MAP_LAYERS;
  }, [availableLayers]);

  const currentIndex = layers.findIndex((l) => l.id === selectedLayer);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentLayer = layers[safeIndex];

  // Dışarıya tıklanırsa veya Escape'e basılırsa menüyü kapat
  useEffect(() => {
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    if (isOpen) {
      containerRef.current?.querySelector('[aria-selected="true"]')?.focus();
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Hızlı Katman Döngüsü (Önceki / Sonraki)
  const handlePrev = (e) => {
      e.stopPropagation();
      const prevIdx = (safeIndex - 1 + layers.length) % layers.length;
      onSelectLayer(layers[prevIdx].id);
  };

  const handleNext = (e) => {
      e.stopPropagation();
      const nextIdx = (safeIndex + 1) % layers.length;
      onSelectLayer(layers[nextIdx].id);
  };

  const handleSelect = (layerId) => {
    onSelectLayer(layerId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`map-layer-selector ${isOpen ? 'is-open' : ''} ${is3D ? 'is-3d' : ''}`}
      role="region"
      aria-label="Harita Katman Seçimi"
    >
      {/* Ana Seçim Kapsülü */}
      <div className="map-layer-pill">
        <button
          type="button"
          className="map-layer-cycle-btn"
          onClick={handlePrev}
          title="Önceki Katmana Geç"
          aria-label="Önceki Katman"
        >
          ‹
        </button>

        <button
          ref={triggerRef}
          type="button"
          className="map-layer-trigger-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          title="Harita Katmanı Seç (Değiştirmek için tıklayın)"
        >
          <span className="map-layer-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </span>
          <span className="map-layer-label">KATMAN:</span>
          <span className="map-layer-current-wrap">
            <span className="map-layer-current-icon">{currentLayer.icon}</span>
            <span className="map-layer-current-text">{currentLayer.shortLabel}</span>
          </span>
          <span className={`map-layer-chevron ${isOpen ? 'is-flipped' : ''}`} aria-hidden="true">
            ▾
          </span>
        </button>

        <button
          type="button"
          className="map-layer-cycle-btn"
          onClick={handleNext}
          title="Sonraki Katmana Geç"
          aria-label="Sonraki Katman"
        >
          ›
        </button>
      </div>

      {/* Açılır Katman Seçim Menüsü */}
      {isOpen && (
        <div
          id={listId}
          className="map-layer-dropdown-panel"
          role="listbox"
          aria-label="Kullanılabilir Harita Katmanları"
          onKeyDown={(event) => {
            const options = [...event.currentTarget.querySelectorAll('[role="option"]')];
            const index = options.indexOf(document.activeElement);
            const next = event.key === 'ArrowDown' ? (index + 1) % options.length
              : event.key === 'ArrowUp' ? (index - 1 + options.length) % options.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); options[next].focus(); }
            if (event.key === 'Tab') setIsOpen(false);
          }}
        >
          <div className="map-layer-dropdown-header">
            <div className="map-layer-dropdown-title">
              <span>HARİTA VERİ KATMANLARI</span>
            </div>
            <span className="map-layer-dropdown-counter">
              {safeIndex + 1} / {layers.length}
            </span>
          </div>

          <div className="map-layer-items-list">
            {layers.map((layer) => {
              const isSelected = layer.id === selectedLayer;
              return (
                <button
                  key={layer.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`map-layer-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelect(layer.id)}
                >
                  <span className="map-layer-item-icon">{layer.icon}</span>
                  <div className="map-layer-item-details">
                    <span className="map-layer-item-title">{layer.label}</span>
                    <span className="map-layer-item-desc">{layer.desc}</span>
                  </div>
                  {isSelected && (
                    <span className="map-layer-item-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="map-layer-dropdown-footer">
            <span>💡 Katman değiştikçe harita renkleri ve verileri anlık güncellenir.</span>
          </div>
        </div>
      )}
    </div>
  );
}

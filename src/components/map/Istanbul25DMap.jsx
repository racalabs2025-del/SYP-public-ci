import { zoomViewport, pinchViewport, mapTooltipPosition, wheelScale, svgPointFromClient as getSvgPointFromClient, clampMapPan } from '../../utils/mapViewport.js';
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { ISTANBUL_DISTRICTS_DATA, DISTRICTS_BY_ID } from '../../data/istanbulDistrictsData';
import { useTheme } from '../../context/themeState.js';
import MapLayerSelector from './MapLayerSelector.jsx';
import './Istanbul25DMap.css';

// Büyük alana sahip ilçeler: tam ad gösterilir; küçük merkez ilçeler: kısa kod gösterilir
const LARGE_DISTRICT_IDS = new Set([
  'catalca',
  'silivri',
  'sile',
  'arnavutkoy',
  'beykoz',
  'eyupsultan',
  'sariyer',
  'basaksehir',
  'buyukcekmece',
  'pendik',
  'cekmekoy',
  'umraniye',
  'sancaktepe',
  'maltepe',
  'kartal',
  'tuzla',
  'esenyurt',
  'kucukcekmece',
]);

const MICRO_DISTRICT_IDS = new Set([
  'gungoren', 'zeytinburnu', 'bayrampasa', 'bahcelievler', 'esenler',
  'bagcilar', 'gaziosmanpasa', 'beyoglu', 'sisli', 'besiktas', 'kagithane', 'fatih',
]);

/**
 * Renk paleti: Yoğunluk seviyesine ve aktif katmana göre kurumsal mavi tonları.
 * Kırmızı/tehlike rengi kesinlikle KULLANILMAZ.
 */
function getDistrictFill(district, selectedLayer, selectedSeflik, liveMetrics = null, isDark = true) {
  // Şeflik filtresi aktifse ve ilçe bu şeflikte birim barındırmıyorsa soluk göster
  if (selectedSeflik && selectedSeflik !== 'Tüm Şeflikler') {
    const hasUnit = district.unitBreakdown?.some((u) =>
      u.name.toLowerCase().includes(selectedSeflik.toLowerCase()) ||
      selectedSeflik.toLowerCase().includes(u.name.toLowerCase())
    );
    if (!hasUnit) return isDark ? '#0f172a' : '#e2e8f0';
  }

  const dMetrics = liveMetrics?.metricsByDistrictId?.[district.id] || null;
  const normScore = liveMetrics?.normalizedScores?.[district.id] ?? null;

  // Renk paleti: veri olmayan ilçeler bile belirgin ama sakin tonlarda kalır
  const noDataColor = isDark ? '#243b62' : '#c7d5e5';
  const high = isDark ? '#38bdf8' : '#1d4ed8';
  const mid = isDark ? '#0284c7' : '#2563eb';
  const low = isDark ? '#0369a1' : '#3b82f6';
  const faint = isDark ? '#2b4d77' : '#93c5fd';

  // Canlı veri varsa ve UNAVAILABLE ise veya no-data ise nötr koyu/açık renk kullan
  if (liveMetrics && (!dMetrics || dMetrics.dataStatus === 'UNAVAILABLE')) {
    return noDataColor;
  }
  const sample = liveMetrics ? {} : district;

  // 1. Genel Operasyon Yoğunluğu (Composite Intensity)
  if (selectedLayer === 'Genel Operasyon Yoğunluğu') {
    if (normScore !== null) {
      if (normScore >= 75) return high;
      if (normScore >= 45) return mid;
      if (normScore >= 20) return low;
      return faint;
    }
    if (liveMetrics) return noDataColor;
    switch (sample.density) {
      case 'yuksek': return high;
      case 'orta': return mid;
      default: return faint;
    }
  }

  // 2. Personel Yoğunluğu
  if (selectedLayer === 'Personel Yoğunluğu') {
    const pCount = dMetrics?.personnel?.active ?? sample.personelCount ?? 0;
    if (pCount >= 30) return high;
    if (pCount >= 15) return mid;
    if (pCount > 0) return low;
    return noDataColor;
  }

  // 3. Başvuru Yoğunluğu
  if (selectedLayer === 'Başvuru Yoğunluğu') {
    const bCount = dMetrics?.applications?.open ?? (dMetrics?.applications?.total ?? sample.basvuruCount ?? 0);
    if (bCount >= 100) return high;
    if (bCount >= 30) return mid;
    if (bCount > 0) return low;
    return noDataColor;
  }

  // 4. Aktif Operasyon
  if (selectedLayer === 'Aktif Operasyonlar' || selectedLayer === 'Aktif Operasyon') {
    const sCount = dMetrics?.shifts?.today ?? sample.activeOperations ?? 0;
    if (sCount >= 10) return high;
    if (sCount >= 4) return mid;
    if (sCount > 0) return low;
    return noDataColor;
  }

  // 5. Kronik Sorunlar
  if (selectedLayer === 'Kronik Sorunlar' || selectedLayer === 'Takip Edilen İşler') {
    const cCount = dMetrics?.chronicIssues?.count ?? sample.chronicIssuesCount ?? 0;
    if (cCount >= 5) return high;
    if (cCount >= 2) return mid;
    if (cCount > 0) return low;
    return noDataColor;
  }

  // 6. Meydanlar
  if (selectedLayer === 'Meydanlar') {
    const mCount = dMetrics?.squares?.count ?? sample.meydanCount ?? 0;
    if (mCount >= 5) return high;
    if (mCount >= 2) return mid;
    if (mCount > 0) return low;
    return noDataColor;
  }

  // 7. Birim Aktivitesi
  if (selectedLayer === 'Birim Aktivitesi' || selectedLayer === 'Gerçekleşen Çalışmalar') {
    const uCount = selectedLayer === 'Gerçekleşen Çalışmalar' ? dMetrics?.activities?.count ?? 0 : dMetrics?.units ?? sample.activeUnitsCount ?? sample.unitBreakdown?.length ?? 0;
    if (uCount >= 3) return high;
    if (uCount >= 2) return mid;
    if (uCount > 0) return low;
    return noDataColor;
  }

  return noDataColor;
}

/**
 * SVG elementinin client koordinatlarını, letterbox veya container kaymaları olmadan
 * piksel-kesin doğrulukla SVG viewBox (1200x620) koordinatlarına dönüştürür.
 * Bu sayede zoom işlemi tam imleç merkezli çalışır ve harita kaymaz.
 */
export default function Istanbul25DMap({
  selectedDistrictId = null,
  onSelectDistrict = () => {},
  selectedNeighborhoodId = null,
  onSelectNeighborhood = () => {},
  selectedLayer = 'Genel Operasyon Yoğunluğu',
  onSelectLayer = () => {},
  availableLayers,
  selectedSeflik = 'Tüm Şeflikler',
  showLabels = false,
  liveMetrics = null,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark'));
  const [hoveredDistrictId, setHoveredDistrictId] = useState(null);
  const [focusedDistrictId, setFocusedDistrictId] = useState(null);
  const [dismissedTooltipId, setDismissedTooltipId] = useState(null);
  const helpId = useId();
  const tooltipId = useId();
  const containerRef = useRef(null);

  const [{ zoom, pan }, setViewport] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [isDragging, setIsDragging] = useState(false);
  const [isWheeling, setIsWheeling] = useState(false);

  // Harita Tekerlek (Zoom) Kontrolü — Sayfa kaydırma ile harita zoom çakışmasını önleme
  const [isWheelZoomActive, setIsWheelZoomActive] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const isWheelZoomActiveRef = useRef(false);
  const scrollHintTimeoutRef = useRef(null);

  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const wheelTimeoutRef = useRef(null);
  const dragResetTimeoutRef = useRef(null);
  const pinchStartRef = useRef(null);

  const canvasWrapRef = useRef(null);
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  const activeDistrictId = hoveredDistrictId || focusedDistrictId;
  const activeDistrict = activeDistrictId ? (DISTRICTS_BY_ID[activeDistrictId] || null) : null;
  const selectedDistrict = selectedDistrictId ? (DISTRICTS_BY_ID[selectedDistrictId] || null) : null;
  const showTooltip = Boolean(activeDistrict?.center && activeDistrictId !== selectedDistrictId && activeDistrictId !== dismissedTooltipId && !isDragging && !isWheeling);
  const sortedDistricts = useMemo(() => [...ISTANBUL_DISTRICTS_DATA].sort((a, b) => {
    const priority = (district) => district.id === selectedDistrictId ? 2 : district.id === hoveredDistrictId ? 1 : 0;
    return priority(a) - priority(b);
  }), [selectedDistrictId, hoveredDistrictId]);

  useLayoutEffect(() => {
    if (!showTooltip) return;
    const svg = svgRef.current;
    const canvas = canvasWrapRef.current;
    const tooltip = tooltipRef.current;
    if (!svg || !canvas || !tooltip) return;
    const updatePosition = () => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = svg.createSVGPoint();
      point.x = activeDistrict.center.x * zoom + pan.x;
      point.y = activeDistrict.center.y * zoom + pan.y;
      const clientPoint = point.matrixTransform(matrix);
      const bounds = canvas.getBoundingClientRect();
      const position = mapTooltipPosition(
        { x: clientPoint.x - bounds.left, y: clientPoint.y - bounds.top },
        tooltip.getBoundingClientRect(), bounds,
      );
      tooltip.style.left = `${position.left}px`;
      tooltip.style.top = `${position.top}px`;
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(canvas);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [activeDistrict, showTooltip, zoom, pan.x, pan.y]);

  useEffect(() => () => clearTimeout(dragResetTimeoutRef.current), []);

  // Seçili ilçe prop'u değiştiğinde (Hızlı Gezgin veya dış tetikleme) haritayı o ilçeye odakla
  useEffect(() => {
    // Parent selection and canvas sizing settle before moving the camera.
    const frame = requestAnimationFrame(() => {
      if (!selectedDistrictId) {
        setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
      } else {
        const district = DISTRICTS_BY_ID[selectedDistrictId];
        if (district?.center) {
          setViewport((prev) => {
            const targetZoom = Math.max(prev.zoom, 1.45);
            return {
              zoom: targetZoom,
              pan: clampMapPan(
                600 - targetZoom * district.center.x,
                310 - targetZoom * district.center.y,
                targetZoom
              ),
            };
          });
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedDistrictId]);

  // Mouse Tekerleği (Wheel) ile Zoom In / Zoom Out (Tam İmleç Merkezli, Kaymasız İlerleme)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onWheel(e) {
      if (!canvasWrapRef.current?.contains(e.target) || e.target.closest?.('button')) return;
      if (!isWheelZoomActiveRef.current) {
        // Zoom aktif değil: Kullanıcı sayfada geziyor, sayfa scrollunu serbest bırak!
        setShowScrollHint(true);
        if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
        scrollHintTimeoutRef.current = setTimeout(() => {
          setShowScrollHint(false);
        }, 1800);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const svgEl = svgRef.current;
      if (!svgEl) return;

      const { x: mouseX, y: mouseY } = getSvgPointFromClient(svgEl, e.clientX, e.clientY);

      // Mouse tekerlek yönü: yukarı (negatif delta) -> yakınlaştır, aşağı (pozitif delta) -> uzaklaştır
      const factor = wheelScale(e.deltaY, e.deltaMode);

      setIsWheeling(true);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => setIsWheeling(false), 140);

      setViewport((view) => zoomViewport(view, factor, { x: mouseX, y: mouseY }));
    }

    function onPointerDown(e) {
      if (!canvasWrapRef.current?.contains(e.target) || e.target.closest?.('button')) return;
      isWheelZoomActiveRef.current = true;
      setIsWheelZoomActive(true);
      setShowScrollHint(false);
    }

    function onPointerLeave() {
      isWheelZoomActiveRef.current = false;
      setIsWheelZoomActive(false);
      setShowScrollHint(false);
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
    }

    function onWindowPointerDown(e) {
      if (container && !container.contains(e.target)) {
        isWheelZoomActiveRef.current = false;
        setIsWheelZoomActive(false);
        setShowScrollHint(false);
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerdown', onWindowPointerDown);

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onWindowPointerDown);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
    };
  }, []);

  // Global Mouse Move & Up Dinleyicisi (Sürükleme ve Tıklama Ayrımı)
  useEffect(() => {
    function onGlobalMouseMove(e) {
      if (!isPointerDownRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      // 4px eşik: Küçük fare kıpırdamalarını sürükleme sayma, tıklamayı koru
      if (Math.hypot(dx, dy) > 4) {
        if (!hasDraggedRef.current) {
          hasDraggedRef.current = true;
          isDraggingRef.current = true;
          setIsDragging(true);
        }

        const svgEl = svgRef.current;
        if (!svgEl) return;
        const start = getSvgPointFromClient(svgEl, dragStartRef.current.x, dragStartRef.current.y);
        const end = getSvgPointFromClient(svgEl, dragStartRef.current.x + dx, dragStartRef.current.y + dy);
        setViewport((view) => ({ ...view, pan: clampMapPan(panStartRef.current.x + end.x - start.x, panStartRef.current.y + end.y - start.y, view.zoom) }));
      }
    }

    function onGlobalMouseUp() {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);

      if (hasDraggedRef.current) {
        dragResetTimeoutRef.current = setTimeout(() => {
          hasDraggedRef.current = false;
        }, 80);
      }
    }

    window.addEventListener('mousemove', onGlobalMouseMove, { passive: false });
    window.addEventListener('mouseup', onGlobalMouseUp);
    window.addEventListener('blur', onGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', onGlobalMouseMove);
      window.removeEventListener('mouseup', onGlobalMouseUp);
      window.removeEventListener('blur', onGlobalMouseUp);
    };
  }, []);

  function handleMouseDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest && e.target.closest('button')) return;
    if (e.button === 1) e.preventDefault();
    clearTimeout(dragResetTimeoutRef.current);

    isPointerDownRef.current = true;
    hasDraggedRef.current = false;
    isDraggingRef.current = false;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  }

  // Dokunmatik Ekranlar (Touch) İçin Kaydırma Desteği
  function handleTouchStart(e) {
    if (e.target.closest?.('button')) return;
    clearTimeout(dragResetTimeoutRef.current);
    if (e.touches.length === 2) {
      const [first, second] = e.touches;
      pinchStartRef.current = {
        view: { zoom, pan: { ...pan } },
        distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        anchor: getSvgPointFromClient(svgRef.current, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2),
      };
      isPointerDownRef.current = false;
      hasDraggedRef.current = true;
      setIsDragging(true);
      return;
    }
    pinchStartRef.current = null;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      isPointerDownRef.current = true;
      hasDraggedRef.current = false;
      isDraggingRef.current = false;
      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
      panStartRef.current = { ...pan };
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const [first, second] = e.touches;
      const start = pinchStartRef.current;
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      if (start.distance > 0) {
        const midpoint = getSvgPointFromClient(svgRef.current, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
        setViewport(pinchViewport(start.view, distance / start.distance, start.anchor, midpoint));
      }
      return;
    }
    if (!isPointerDownRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStartRef.current.x;
    const dy = touch.clientY - dragStartRef.current.y;

    if (Math.hypot(dx, dy) > 4) {
      if (!hasDraggedRef.current) {
        hasDraggedRef.current = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      const svgEl = svgRef.current;
      if (!svgEl) return;
      const start = getSvgPointFromClient(svgEl, dragStartRef.current.x, dragStartRef.current.y);
      const end = getSvgPointFromClient(svgEl, dragStartRef.current.x + dx, dragStartRef.current.y + dy);
      setViewport((view) => ({ ...view, pan: clampMapPan(panStartRef.current.x + end.x - start.x, panStartRef.current.y + end.y - start.y, view.zoom) }));
    }
  }

  function handleTouchEnd(e) {
    pinchStartRef.current = null;
    if (e.touches.length === 1 && e.type !== 'touchcancel') {
      const touch = e.touches[0];
      isPointerDownRef.current = true;
      dragStartRef.current = { x: touch.clientX, y: touch.clientY };
      panStartRef.current = { ...pan };
      return;
    }
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (hasDraggedRef.current) {
      dragResetTimeoutRef.current = setTimeout(() => {
        hasDraggedRef.current = false;
      }, 80);
    }
  }

  function handlePanNudge(dx, dy) {
    setViewport((view) => ({ ...view, pan: clampMapPan(view.pan.x + dx, view.pan.y + dy, view.zoom) }));
  }

  function handleDoubleClick(e) {
    if (e.target.closest && e.target.closest('button')) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const { x: mouseX, y: mouseY } = getSvgPointFromClient(svgEl, e.clientX, e.clientY);

    setViewport((view) => zoomViewport(view, 1.45, { x: mouseX, y: mouseY }));
  }

  function handleZoomIn() {
    setViewport((view) => zoomViewport(view, 1.25));
  }

  function handleZoomOut() {
    setViewport((view) => zoomViewport(view, 0.8));
  }

  function handleResetZoom() {
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function handleDistrictClick(e, district) {
    if (e) {
      e.stopPropagation();
    }
    if (hasDraggedRef.current && e?.type !== 'keydown') {
      return;
    }

    // Zaten seçiliyse: mahalle seçimi varsa temizler ve ilçe ekranına döner
    if (selectedDistrictId === district.id) {
      if (selectedNeighborhoodId) {
        if (onSelectNeighborhood) onSelectNeighborhood(null);
      }
    } else {
      if (onSelectNeighborhood) onSelectNeighborhood(null);
      onSelectDistrict(district);
    }
  }

  function handleBackgroundClick(e) {
    if (hasDraggedRef.current) {
      return;
    }
    if (e.target.closest?.('.district-group, button')) return;

    if (selectedNeighborhoodId) {
      // 1. TIKLAMA: Mahalle seçiliyse hemen tüm ilçelere dönme, altta ilçe ekranı açılsın!
      if (onSelectNeighborhood) onSelectNeighborhood(null);
    } else if (selectedDistrictId) {
      // 2. TIKLAMA: Tekrar tıklama olursa tüm ilçeler İstanbul haritası açılsın!
      onSelectDistrict(null);
    }
  }

  function handleMapKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('button')) return;
    const key = e.key;
    if (key === 'Escape') {
      if (!showTooltip && !isWheelZoomActive) return;
      setDismissedTooltipId(activeDistrictId);
      isWheelZoomActiveRef.current = false;
      setIsWheelZoomActive(false);
      setShowScrollHint(false);
    } else if (key === '+' || key === '=') handleZoomIn();
    else if (key === '-') handleZoomOut();
    else if (key === '0' || key === 'Home') handleResetZoom();
    else if (key === 'ArrowLeft') handlePanNudge(120, 0);
    else if (key === 'ArrowRight') handlePanNudge(-120, 0);
    else if (key === 'ArrowUp') handlePanNudge(0, 100);
    else if (key === 'ArrowDown') handlePanNudge(0, -100);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      className={`istanbul-map-container istanbul-25d-map-container ${isWheelZoomActive ? 'is-zoom-active' : ''}`}
      ref={containerRef}
    >
      {/* Yakınlaştırma Durum Rozeti (Scroll Trapping Önleme ve Kullanıcı Rehberi) */}
      {(isWheelZoomActive || showScrollHint) && (
        <div
          className={`map-zoom-scroll-indicator ${isWheelZoomActive ? 'is-active' : ''} ${showScrollHint && !isWheelZoomActive ? 'is-hint' : ''}`}
          role="status"
          aria-live="polite"
        >
          {isWheelZoomActive ? (
            <>
              <span className="mzsi-pulse-dot" />
              <span className="mzsi-text">Yakınlaştırma Aktif</span>
              <span className="mzsi-sub">· Fareyi haritadan çıkararak sayfayı kaydırabilirsiniz</span>
            </>
          ) : (
            <>
              <span className="mzsi-icon">🖱️</span>
              <span className="mzsi-text">Yakınlaştırmak için haritaya tıklayın</span>
              <span className="mzsi-sub">· Sayfayı kaydırmak için serbestçe scroll yapabilirsiniz</span>
            </>
          )}
        </div>
      )}

      {/* Üst Durum ve Katman Seçici Barı */}
      <div className="map-top-bar">
        <MapLayerSelector
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          availableLayers={availableLayers}
          is3D={false}
        />

        {selectedDistrict ? (
          <div className="map-active-status-badge is-active">
            <span className="map-status-dot is-selected" />
            <span className="map-status-text">
              Seçili İlçe: <strong>{selectedDistrict.name.toUpperCase()}</strong>
            </span>
            <button
              type="button"
              className="map-reset-view-btn"
              onClick={() => onSelectDistrict(null)}
              title="Harita seçimini temizle ve İstanbul geneline dön"
            >
              ✕ Tüm Harita
            </button>
          </div>
        ) : (
          <div className="map-active-status-badge">
            <span className="map-status-dot is-overview" />
            <span className="map-status-text">
              İstanbul Geneli (39 İlçe) · Büyütmek için bir ilçeye tıklayın
            </span>
          </div>
        )}
      </div>

      {/* SVG Canvas - Gerçek 3D Perspektif Görünümü (Mouse Tekerleği ile Zoom & Sürükleme) */}
      <div
        ref={canvasWrapRef}
        className={`istanbul-map-canvas-wrap ${zoom > 1.05 ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
        onClick={handleBackgroundClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleMapKeyDown}
        role="presentation"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1200 620"
          className="istanbul-map-svg"
          preserveAspectRatio="xMidYMid meet"
          role="region"
          aria-label="Gerçek Sınırlarla İstanbul İlçe Operasyon Haritası"
          aria-describedby={helpId}
          tabIndex={0}
        >
          <desc id={helpId}>Yakınlaştırmak için artı ve eksi, kaydırmak için yön tuşları, görünümü sıfırlamak için 0. İlçeler arasında Tab ile gezinip Enter ile seçin. Bilgi kartını ve tekerlek yakınlaştırmasını kapatmak için Escape.</desc>
          {/* 3D Görsel Efekt Tanımları (Gradients & Filters) */}
          <defs>
            {/* 3D Yükselen İlçe Derinlik Gradyanı */}
            <linearGradient id="district-3d-depth-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.95" />
            </linearGradient>

            {/* 3D Ayak İzi (Footprint) Soket Deseni / Gradyanı */}
            <linearGradient id="district-3d-socket-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0.5" />
            </linearGradient>

            {/* Seçili İlçe 3D Parıltı Filtresi */}
            <filter id="district-3d-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#0284c7" floodOpacity="0.45" />
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0369a1" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Boş Alan Tıklama Hitbox'ı (Harita dışına/suya tıklayınca deselect eder) */}
          <rect
            className="map-bg-hitbox"
            x="-4000"
            y="-3000"
            width="10000"
            height="8000"
            fill="transparent"
            onClick={handleBackgroundClick}
          />

          {/* Zoom & Pan Dönüşüm Grubu */}
          <g
            className={`map-viewport-group ${selectedDistrictId ? 'has-selection' : ''}`}
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{
              transformOrigin: '0 0',
              transition: isDragging || isWheeling ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Su Tabanı ve Grid Hatları */}
          <g className="map-geo-grid" opacity="0.7">
            <line x1="40" y1="120" x2="1160" y2="120" />
            <line x1="40" y1="260" x2="1160" y2="260" />
            <line x1="40" y1="400" x2="1160" y2="400" />
            <line x1="40" y1="540" x2="1160" y2="540" />
            <line x1="200" y1="40" x2="200" y2="580" />
            <line x1="450" y1="40" x2="450" y2="580" />
            <line x1="670" y1="40" x2="670" y2="580" />
            <line x1="920" y1="40" x2="920" y2="580" />
          </g>

          {/* Su Alanı Etiketleri */}
          <text x="600" y="65" className="map-water-label" textAnchor="middle">KARADENİZ</text>
          <text x="600" y="585" className="map-water-label" textAnchor="middle">MARMARA DENİZİ</text>
          <text x="682" y="340" className="map-water-label map-water-label--bosphorus" transform="rotate(78 682 340)">
            BOĞAZİÇİ
          </text>
          <text x="618" y="415" className="map-water-label" style={{ fontSize: '9px', letterSpacing: '0.12em' }}>
            HALİÇ
          </text>

          {/* Boğaz Köprüleri */}
          <line x1="654" y1="396" x2="666" y2="406" className="map-bridge-line" />
          <text x="674" y="401" className="map-bridge-label">15 Temmuz</text>

          <line x1="664" y1="362" x2="676" y2="370" className="map-bridge-line" />
          <text x="684" y="367" className="map-bridge-label">FSM</text>

          <line x1="686" y1="278" x2="700" y2="284" className="map-bridge-line" />
          <text x="708" y="282" className="map-bridge-label">YSS</text>

          {/* 3D Ayrılmış İlçe Ayak İzi (Footprint / Puzzle Soketi) - Taban Harita Düzleminde Çizilir */}
          {selectedDistrict && (
            <g className="district-3d-footprint-group" pointerEvents="none">
              <path
                d={selectedDistrict.path}
                className="district-3d-footprint-base"
                fill="url(#district-3d-socket-grad)"
              />
              <path
                d={selectedDistrict.path}
                className="district-3d-footprint-border"
              />
            </g>
          )}

          {/* 39 Gerçek İlçe Poligonu (Seçili ve hover'lanan ilçe en üstte çizilsin diye sıralanır) */}
          <g>
            {sortedDistricts.map((district) => {
                const isSelected = selectedDistrictId === district.id;
                const isHovered = activeDistrictId === district.id;
                const hasSelection = Boolean(selectedDistrictId);
                const isDimmed = hasSelection && !isSelected;
                const fill = getDistrictFill(district, selectedLayer, selectedSeflik, liveMetrics, isDark);
                const isLarge = LARGE_DISTRICT_IDS.has(district.id);
                const isMicroDistrict = MICRO_DISTRICT_IDS.has(district.id);
                const dMetrics = liveMetrics?.metricsByDistrictId?.[district.id];
                const accessiblePersonnel = liveMetrics ? (dMetrics?.dataStatus === 'UNAVAILABLE' ? null : dMetrics?.personnel?.active) : district.personelCount;

                // Zoom ve LOD bazlı etiket görünürlüğü (Merkez ilçelerin üst üste binmesini kesinlikle engeller):
                const labelText = zoom >= 1.8 ? district.name : (isLarge ? district.name : district.shortName);
                const shouldShowLabel = isSelected || isHovered || showLabels || (
                  isMicroDistrict ? zoom >= 3.0 : (isLarge ? zoom >= 1.1 : zoom >= 1.8)
                );

                return (
                  <g
                    key={district.id}
                    className={`district-group ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                    style={{
                      transformOrigin: `${district.center?.x || 600}px ${district.center?.y || 310}px`,
                    }}
                    onClick={(e) => handleDistrictClick(e, district)}
                    onMouseEnter={() => { setHoveredDistrictId(district.id); setDismissedTooltipId(null); }}
                    onMouseLeave={() => setHoveredDistrictId(null)}
                    onFocus={() => { setFocusedDistrictId(district.id); setDismissedTooltipId(null); }}
                    onBlur={() => setFocusedDistrictId(null)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${district.name} ilçesi${accessiblePersonnel != null ? `, ${accessiblePersonnel} planlanan personel` : ', personel verisi yok'}`}
                    aria-pressed={isSelected}
                    aria-describedby={showTooltip && activeDistrictId === district.id ? tooltipId : undefined}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleDistrictClick(e, district);
                      }
                    }}
                  >
                    {/* 3D Extrusion Yan Duvarları (Seçili ilçede fiziksel blok derinliği) */}
                    {isSelected && (
                      <>
                        <path
                          d={district.path}
                          className="district-3d-extrusion-wall district-3d-extrusion-deep"
                          transform="translate(0, 16)"
                          fill="url(#district-3d-depth-grad)"
                        />
                        <path
                          d={district.path}
                          className="district-3d-extrusion-wall district-3d-extrusion-mid"
                          transform="translate(0, 8)"
                          fill="#0284c7"
                          opacity="0.6"
                        />
                      </>
                    )}

                    {/* 2.5D Derinlik Etek Katmanı (Seçili değilken hafif taban gölgesi) */}
                    {!isSelected && (
                      <path
                        d={district.path}
                        className="district-depth"
                        transform="translate(0, 2.5)"
                      />
                    )}

                    {/* Gerçek İlçe Sınır Poligonu (Yüzey) */}
                    <path
                      d={district.path}
                      className="district-polygon"
                      fill={fill}
                      transform={isSelected ? 'translate(0, -6)' : undefined}
                    />

                    {/* İlçe İsim Etiketleri (Zooma göre dinamik ve yüksek kontrastlı) */}
                    {shouldShowLabel && district.center && (
                      <text
                        x={district.center.x}
                        y={isSelected ? district.center.y - 6 : district.center.y}
                        className={`district-label-text ${isLarge ? 'district-label-text--large' : ''} ${isSelected ? 'district-label-text--selected' : ''}`}
                        style={{
                          fontSize: `${Math.max(8.5, Math.min(12.5, 11 / Math.pow(zoom, 0.4)))}px`,
                        }}
                      >
                        {labelText}
                      </text>
                    )}

                    {/* 3D Seçili İlçe Uçan Bilgi Kartı / Rozeti */}
                    {isSelected && district.center && (
                      <g
                        className="district-3d-floating-badge"
                        transform={`translate(${district.center.x}, ${district.center.y - 36})`}
                        pointerEvents="none"
                      >
                        {/* Dikey Işık / Bağlantı İpi */}
                        <line x1="0" y1="12" x2="0" y2="30" className="district-3d-tether-line" />
                        <circle cx="0" cy="30" r="2.5" fill="#38bdf8" />

                        {/* Uçan Rozet Arka Planı */}
                        <rect
                          x="-62"
                          y="-14"
                          width="124"
                          height="26"
                          rx="13"
                          className="district-3d-badge-bg"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          className="district-3d-badge-text"
                        >
                          {district.name.toUpperCase()}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
          </g>

          {/* Kadıköy Tek Seferlik Soft Pulse Dairesi (3 Kez Dalgalanır) */}
          {DISTRICTS_BY_ID['kadikoy'] && DISTRICTS_BY_ID['kadikoy'].center && (
            <g pointerEvents="none">
              <circle
                cx={DISTRICTS_BY_ID['kadikoy'].center.x}
                cy={DISTRICTS_BY_ID['kadikoy'].center.y}
                className="pulse-circle-oneshot"
              />
              <circle
                cx={DISTRICTS_BY_ID['kadikoy'].center.x}
                cy={DISTRICTS_BY_ID['kadikoy'].center.y}
                r="3.5"
                fill="#38bdf8"
                opacity="0.9"
              />
            </g>
          )}

          {/* Seçili İlçe İçin Büyüyen ve Nabız Veren Merkez Beacon İşareti */}
          {selectedDistrict && selectedDistrict.center && (
            <g
              className="district-selection-beacon"
              transform={`translate(${selectedDistrict.center.x}, ${selectedDistrict.center.y - 6})`}
              pointerEvents="none"
            >
              <circle cx="0" cy="0" className="beacon-ring-outer" />
              <circle cx="0" cy="0" className="beacon-ring-middle" />
              <circle cx="0" cy="0" r="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
            </g>
          )}
          </g>
        </svg>

        {/* Gelişmiş Hover Tooltip Balonu (Seçim yokken hover'da gösterilir) */}
        {showTooltip && (() => {
          const dMetrics = liveMetrics?.metricsByDistrictId?.[activeDistrict.id] || null;
          const unavailable = liveMetrics && (!dMetrics || dMetrics.dataStatus === 'UNAVAILABLE');
          const metric = (value, fallback) => unavailable ? '—' : value ?? (liveMetrics ? '—' : fallback ?? '—');
          const pCount = metric(dMetrics?.personnel?.active, activeDistrict.personelCount);
          const bCount = metric(dMetrics?.shifts?.today, activeDistrict.activeOperations);
          const uCount = metric(dMetrics?.units, activeDistrict.activeUnitsCount ?? activeDistrict.unitBreakdown?.length);
          const cCount = metric(dMetrics?.chronicIssues?.count, activeDistrict.chronicIssuesCount);
          const score = liveMetrics?.normalizedScores?.[activeDistrict.id];
          const density = liveMetrics ? (unavailable || score == null ? null : score >= 75 ? 'yuksek' : score >= 45 ? 'orta' : 'dusuk') : activeDistrict.density;

          return (
            <div
              className="map-floating-tooltip"
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
            >
              <div className="map-tooltip-card-compact">
                <div className="map-tooltip-header-compact">
                  <div className="map-tooltip-title-group-compact">
                    <span className="map-tooltip-pin-dot" />
                    <span className="map-tooltip-title-compact">{activeDistrict.name}</span>
                    <span className="map-tooltip-yaka-compact">
                      {activeDistrict.yaka === 'anadolu' ? 'Anadolu' : 'Avrupa'}
                    </span>
                  </div>
                  <div className={`map-tooltip-density-compact is-${density}`}>
                    <span className="map-badge-dot" />
                    <span>
                      {density === 'yuksek' ? 'Yüksek' : density === 'orta' ? 'Orta' : density === 'dusuk' ? 'Düşük' : 'Veri yok'}
                    </span>
                  </div>
                </div>

                <div className="map-tooltip-metrics-grid-compact">
                  <div className="map-tooltip-metric-box">
                    <span className="map-metric-label">👥 Planlanan Personel</span>
                    <strong className="map-metric-val">{pCount}</strong>
                  </div>
                  <div className="map-tooltip-metric-box">
                    <span className="map-metric-label">📅 Görev Planı</span>
                    <strong className="map-metric-val">{bCount}</strong>
                  </div>
                  <div className="map-tooltip-metric-box">
                    <span className="map-metric-label">🏛️ Aktif Birim</span>
                    <strong className="map-metric-val">{uCount}</strong>
                  </div>
                  <div className="map-tooltip-metric-box">
                    <span className="map-metric-label">📋 Takip Edilen İş</span>
                    <strong className="map-metric-val">{cCount}</strong>
                  </div>
                </div>

                <div className="map-tooltip-hint-compact">İlçe detayları için tıklayın veya Enter ↗</div>
              </div>
            </div>
          );
        })()}

        {/* Sol Alt Zoom ve Kaydırma Kontrolleri */}
        <div className="map-zoom-controls" aria-label="Harita Yakınlaştırma ve Kaydırma Kontrolleri">
          <button
            type="button"
            className="map-zoom-btn"
            onClick={handleZoomIn}
            title="Yakınlaştır (Mouse tekerleği yukarı veya +)"
            aria-label="Yakınlaştır"
            disabled={zoom >= 6}
          >
            +
          </button>
          <button
            type="button"
            className="map-zoom-btn map-zoom-level-btn"
            onClick={handleResetZoom}
            title="Yakınlaştırmayı ve Konumu Sıfırla (%100)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="map-zoom-btn"
            onClick={handleZoomOut}
            title="Uzaklaştır (Mouse tekerleği aşağı veya −)"
            aria-label="Uzaklaştır"
            disabled={zoom <= 1}
          >
            −
          </button>

          <div className="map-zoom-divider" />

          {/* Sağa Sola Hızlı Kaydırma Butonları */}
          <button
            type="button"
            className="map-zoom-btn map-pan-btn"
            onClick={() => handlePanNudge(120, 0)}
            title="Haritayı Sola Kaydır (Silivri / Çatalca yönü)"
            aria-label="Haritayı Sola Kaydır"
            disabled={pan.x >= 0}
          >
            ◀
          </button>
          <button
            type="button"
            className="map-zoom-btn map-pan-btn"
            onClick={() => handlePanNudge(-120, 0)}
            title="Haritayı Sağa Kaydır (Tuzla / Pendik yönü)"
            aria-label="Haritayı Sağa Kaydır"
            disabled={pan.x <= -1200 * (zoom - 1)}
          >
            ▶
          </button>

          {(zoom !== 1 || Math.abs(pan.x) > 10 || Math.abs(pan.y) > 10) && (
            <button
              type="button"
              className="map-zoom-btn map-zoom-reset-btn"
              onClick={handleResetZoom}
              title="Merkeze Dön (%100 ve Orijin)"
              aria-label="Merkeze Dön"
            >
              ⟲
            </button>
          )}
        </div>
      </div>

      {/* Minimal Legend (Sağ Alt) */}
      <div className="map-legend">
        <span>Yoğunluk:</span>
        <div className="map-legend-bar" />
        <div className="map-legend-endpoints">
          <span>Düşük</span>
          <span>→</span>
          <span>Yüksek</span>
        </div>
      </div>
    </div>
  );
}

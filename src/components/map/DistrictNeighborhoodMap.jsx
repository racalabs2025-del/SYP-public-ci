import { wheelScale } from '../../utils/mapViewport.js';
import React, { useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import { layoutNeighborhoodLabels } from '../../utils/neighborhoodLabelLayout.js';
import { projectNeighborhoodCoordinates } from '../../utils/mapCoordinates.js';
import { useNeighborhoodBoundaries } from '../../hooks/useNeighborhoodBoundaries.js';
import { NEIGHBORHOOD_LAYERS, neighborhoodScale, neighborhoodColorLevel } from '../../domain/neighborhoodMapMetrics.js';
import { geoPaths } from '../../data/istanbulGeoJsonPaths.js';
import {
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowPathIcon,
  MapPinIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  TagIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import './DistrictNeighborhoodMap.css';

const EMPTY_NEIGHBORHOODS = [];

export default function DistrictNeighborhoodMap(props) {
  return <DistrictNeighborhoodMapView key={props.districtSlug || 'uskudar'} {...props} />;
}

function DistrictNeighborhoodMapView({
  districtSlug = 'uskudar',
  districtName = 'Üsküdar',
  neighborhoods: sourceNeighborhoods = EMPTY_NEIGHBORHOODS,
  selectedNeighborhoodId = null,
  onSelectNeighborhood = () => {},
  onOpenNeighborhood,
  operationMetrics,
  unitLabel = 'Tüm birimler',
  coverageNote = '',
  onOpenRecord,
  showLabels = true,
  defaultFocusMode = 'district',
}) {
  const boundaryState = useNeighborhoodBoundaries(districtSlug);
  const boundaryData = boundaryState.data;
  const boundariesById = useMemo(() => new Map((boundaryData?.features || []).map(f => [f.id, f])), [boundaryData]);
  const neighborhoods = useMemo(() => sourceNeighborhoods.map(n => ({ ...n,
    svgCoords: boundariesById.get(n.id)?.anchor || projectNeighborhoodCoordinates(n),
    hasBoundary: boundariesById.has(n.id),
  })), [sourceNeighborhoods, boundariesById]);
  const [operationLayer, setOperationLayer] = useState('people');
  const [recordLimit, setRecordLimit] = useState(12);
  const [recordScope, setRecordScope] = useState(null);
  const activeLayer = NEIGHBORHOOD_LAYERS.find(l => l.id === operationLayer);
  const operationReady = operationMetrics?.status === 'ready';
  const operationStatus = operationMetrics?.status === 'loading' ? 'Veriler yükleniyor'
    : operationMetrics?.status === 'unavailable' ? 'Operasyon verisi alınamadı' : 'Veri Bekleniyor';
  const colorScale = useMemo(() => neighborhoodScale(Object.values(operationMetrics?.byId || {}).map(m => m[operationLayer])), [operationMetrics, operationLayer]);
  const metricText = (id) => operationReady ? `${operationMetrics.byId[id]?.[operationLayer] ?? 0} ${activeLayer.unit}` : operationStatus;

  const containerRef = useRef(null);
  const mapId = useId();
  const [listOpen, setListOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedId, setFocusedId] = useState(null);
  const [labelWidths, setLabelWidths] = useState({});
  const listToggleRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 520 });

  // Harita Tekerlek (Zoom) Kontrolü — Sayfa kaydırma ile harita zoom çakışmasını önleme
  const [isWheelZoomActive, setIsWheelZoomActive] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const isWheelZoomActiveRef = useRef(false);
  const scrollHintTimeoutRef = useRef(null);

  // Aktif İlçe Geometrisi ve Sınırları
  const activeGeo = geoPaths[districtSlug] || geoPaths['uskudar'];
  const bounds = useMemo(() => activeGeo?.bounds || { minX: 600, maxX: 700, minY: 300, maxY: 400, width: 100, height: 100 }, [activeGeo]);

  // Include neighborhood points so edge labels are not cropped in the overview.
  const viewBounds = useMemo(() => {
    const points = neighborhoods.map((n) => n.svgCoords).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    const boundaryBounds = (boundaryData?.features || []).map(f => f.bounds);
    const minX = Math.min(bounds.minX, ...points.map((p) => p.x), ...boundaryBounds.map(b => b.minX));
    const maxX = Math.max(bounds.maxX, ...points.map((p) => p.x), ...boundaryBounds.map(b => b.maxX));
    const minY = Math.min(bounds.minY, ...points.map((p) => p.y), ...boundaryBounds.map(b => b.minY));
    const maxY = Math.max(bounds.maxY, ...points.map((p) => p.y), ...boundaryBounds.map(b => b.maxY));
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  }, [bounds, neighborhoods, boundaryData]);

  // Seçili Mahalle
  const selectedNeigh = useMemo(() => {
    if (!selectedNeighborhoodId) return null;
    return neighborhoods.find((n) => n.id === selectedNeighborhoodId) || null;
  }, [selectedNeighborhoodId, neighborhoods]);

  // En Yakın 5 Komşu Mahalle (Kuş uçuşu gerçek mesafe)
  const closestNeighbors = useMemo(() => {
    if (!selectedNeigh?.latitude || !selectedNeigh?.longitude) return [];
    return neighborhoods
      .filter((n) => n.id !== selectedNeigh.id && n.latitude && n.longitude)
      .map((n) => {
        const dLat = (n.latitude - selectedNeigh.latitude) * 111;
        const dLon = (n.longitude - selectedNeigh.longitude) * 83.8;
        const distKm = Math.hypot(dLat, dLon);
        return {
          ...n,
          distKm: distKm < 1 ? Math.round(distKm * 1000) + ' m' : distKm.toFixed(1) + ' km',
          rawDist: distKm,
        };
      })
      .sort((a, b) => a.rawDist - b.rawDist)
      .slice(0, 5);
  }, [selectedNeigh, neighborhoods]);

  // Container Boyutlarını Ölçme (ResizeObserver)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // İlçe merkez noktası
  const defaultDistrictCenter = useMemo(() => {
    return {
      x: viewBounds.minX + (viewBounds.width || 100) / 2,
      y: viewBounds.minY + (viewBounds.height || 100) / 2,
    };
  }, [viewBounds.minX, viewBounds.minY, viewBounds.width, viewBounds.height]);

  // Kamera Durumu: Varsayılan olarak tüm ilçeyi ve mahalleleri gösterecek dengeli zoom ile başla
  const [camera, setCameraState] = useState(() => {
    const isNeighMode = defaultFocusMode === 'neighborhood' && selectedNeigh?.svgCoords;
    return {
      x: isNeighMode ? selectedNeigh.svgCoords.x : defaultDistrictCenter.x,
      y: isNeighMode ? selectedNeigh.svgCoords.y : defaultDistrictCenter.y,
      zoom: isNeighMode ? 1.8 : 1.05,
    };
  });

  const setCamera = useCallback((update) => setCameraState((previous) => {
    const next = typeof update === 'function' ? update(previous) : update;
    return {
      ...next,
      x: Math.max(viewBounds.minX, Math.min(viewBounds.maxX, next.x)),
      y: Math.max(viewBounds.minY, Math.min(viewBounds.maxY, next.y)),
    };
  }), [viewBounds.minX, viewBounds.maxX, viewBounds.minY, viewBounds.maxY]);

  // Selection must not reset a manually panned district view.
  const focusX = defaultFocusMode === 'neighborhood' ? selectedNeigh?.svgCoords?.x : undefined;
  const focusY = defaultFocusMode === 'neighborhood' ? selectedNeigh?.svgCoords?.y : undefined;
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCamera({
      x: focusX ?? defaultDistrictCenter.x,
      y: focusY ?? defaultDistrictCenter.y,
      zoom: focusX !== undefined ? 1.8 : 1.05,
    }));
    return () => cancelAnimationFrame(frame);
  }, [districtSlug, defaultDistrictCenter, focusX, focusY, setCamera]);

  const [hoveredNeigh, setHoveredNeigh] = useState(null);
  const [labelsEnabled, setLabelsEnabled] = useState(showLabels);
  const [isDragging, setIsDragging] = useState(false);

  // Drag ref verileri
  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startCamX: 0,
    startCamY: 0,
  });

  // Base Bounding Box (En-Boy Oranı Dengeli)
  const baseViewBox = useMemo(() => {
    const rawW = viewBounds.width || 100;
    const rawH = viewBounds.height || 100;
    const aspect = dimensions.width / Math.max(dimensions.height, 1);
    const rawAspect = rawW / rawH;

    let baseW, baseH;
    if (rawAspect > aspect) {
      baseW = rawW * 1.35;
      baseH = baseW / aspect;
    } else {
      baseH = rawH * 1.35;
      baseW = baseH * aspect;
    }
    return { baseW, baseH };
  }, [viewBounds.width, viewBounds.height, dimensions]);

  // Güncel SVG ViewBox Parametreleri
  const currentView = useMemo(() => {
    const viewW = baseViewBox.baseW / camera.zoom;
    const viewH = baseViewBox.baseH / camera.zoom;
    const viewX = camera.x - viewW / 2;
    const viewY = camera.y - viewH / 2;
    return {
      viewX,
      viewY,
      viewW,
      viewH,
      viewBoxStr: `${viewX} ${viewY} ${viewW} ${viewH}`,
    };
  }, [baseViewBox, camera]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FARE TEKERLEĞİ İLE İMLECE DOĞRU YAKINLAŞMA (SMOOTH MOUSE WHEEL ZOOM)
  // Max zoom 5.0x ile sınırlandırıldı (aşırı büyüyüp kaybolmayı önler)
  // ═══════════════════════════════════════════════════════════════════════════
  const handleWheel = useCallback((e) => {
    if (!isWheelZoomActiveRef.current) {
      // Zoom aktif değil: Sayfa scrollunu serbest bırak (preventDefault çağrılmaz)
      setShowScrollHint(true);
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
      scrollHintTimeoutRef.current = setTimeout(() => {
        setShowScrollHint(false);
      }, 1800);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // İmlecin şu anki SVG koordinatları
    const svgMouseX = currentView.viewX + (mouseX / rect.width) * currentView.viewW;
    const svgMouseY = currentView.viewY + (mouseY / rect.height) * currentView.viewH;

    const factor = wheelScale(e.deltaY, e.deltaMode, dimensions.height);
    const newZoom = Math.max(0.75, Math.min(5.0, camera.zoom * factor));

    // İmlecin altındaki SVG noktasının ekranda aynı pikselde kalması için yeni merkez
    const newViewW = baseViewBox.baseW / newZoom;
    const newViewH = baseViewBox.baseH / newZoom;
    const newViewX = svgMouseX - (mouseX / rect.width) * newViewW;
    const newViewY = svgMouseY - (mouseY / rect.height) * newViewH;

    setCamera({
      x: newViewX + newViewW / 2,
      y: newViewY + newViewH / 2,
      zoom: newZoom,
    });
  }, [camera, currentView, baseViewBox, dimensions.height, setCamera]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onPointerDown() {
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
      if (el && !el.contains(e.target)) {
        isWheelZoomActiveRef.current = false;
        setIsWheelZoomActive(false);
        setShowScrollHint(false);
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerdown', onWindowPointerDown);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerdown', onWindowPointerDown);
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
    };
  }, [handleWheel]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FARE İLE TUTUP SERBESTÇE KAYDIRMA (DRAG & PAN)
  // ═══════════════════════════════════════════════════════════════════════════
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest('.syp-html-neigh-pin-wrap, button, a')) return;
    dragRef.current = {
      active: true,
      moved: false,
      neighborhoodId: e.target.closest('[data-neighborhood-id]')?.dataset.neighborhoodId,
      startX: e.clientX,
      startY: e.clientY,
      startCamX: camera.x,
      startCamY: camera.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
    const svgDx = dx * (currentView.viewW / dimensions.width);
    const svgDy = dy * (currentView.viewH / dimensions.height);

    setCamera((prev) => ({
      ...prev,
      x: dragRef.current.startCamX - svgDx,
      y: dragRef.current.startCamY - svgDy,
    }));
  };

  const handlePointerUp = (e) => {
    if (dragRef.current.active) {
      const clickedId = !dragRef.current.moved && e.type !== 'pointercancel' ? dragRef.current.neighborhoodId : null;
      dragRef.current.active = false;
      setIsDragging(false);
      if (clickedId) {
        const clicked = neighborhoods.find(n => n.id === clickedId);
        if (clicked) onSelectNeighborhood(clicked);
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch { /* Pointer capture may already be released. */ }
    }
  };

  // Buton Kontrolleri
  const handleZoomIn = () => setCamera((prev) => ({ ...prev, zoom: Math.min(prev.zoom * 1.3, 5.0) }));
  const handleZoomOut = () => setCamera((prev) => ({ ...prev, zoom: Math.max(prev.zoom * 0.77, 0.75) }));

  const handleFocusNeighborhood = () => {
    if (selectedNeigh?.svgCoords) {
      setCamera({
        x: selectedNeigh.svgCoords.x,
        y: selectedNeigh.svgCoords.y,
        zoom: 2.5,
      });
    }
  };

  const handleFocusDistrict = () => {
    setCamera({
      x: defaultDistrictCenter.x,
      y: defaultDistrictCenter.y,
      zoom: 1.0,
    });
  };

  // Measure the same font used by the label buttons; names remain at a readable size.
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      setLabelWidths(Object.fromEntries(neighborhoods.map((n) => [n.id, Math.ceil(context.measureText(n.name).width) + 24])));
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => { cancelled = true; };
  }, [neighborhoods]);

  const activeNeigh = hoveredNeigh || neighborhoods.find(n => n.id === focusedId);
  const previewNeigh = activeNeigh || selectedNeigh;
  const normalizeSearch = (value) => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  const filteredNeighborhoods = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return neighborhoods.filter(n => normalizeSearch(n.name).includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [neighborhoods, search]);

  const projectedNeighborhoods = useMemo(() => neighborhoods
    .filter(n => Number.isFinite(n.svgCoords?.x) && Number.isFinite(n.svgCoords?.y))
    .map(n => ({
      ...n,
      x: ((n.svgCoords.x - currentView.viewX) / currentView.viewW) * dimensions.width,
      y: ((n.svgCoords.y - currentView.viewY) / currentView.viewH) * dimensions.height,
      labelWidth: labelWidths[n.id] || n.name.length * 8 + 24,
      priority: n.id === selectedNeighborhoodId ? 1 : 0,
    })), [neighborhoods, currentView, dimensions, labelWidths, selectedNeighborhoodId]);

  const labelOptions = useMemo(() => ({
    points: projectedNeighborhoods,
    ...dimensions,
    zoom: camera.zoom,
    showLabels: labelsEnabled,
    reserved: [
      { x: 0, y: 0, width: 58, height: 64 },
      { x: dimensions.width - 76, y: 0, width: 76, height: 52 },
    ],
  }), [projectedNeighborhoods, dimensions, camera.zoom, labelsEnabled]);
  const baseLabelLayout = useMemo(() => layoutNeighborhoodLabels(labelOptions), [labelOptions]);
  const labelLayout = useMemo(() => activeNeigh ? layoutNeighborhoodLabels({
    ...labelOptions,
    points: projectedNeighborhoods.map(n => ({ ...n, priority: n.id === activeNeigh.id ? 2 : n.priority })),
    preferredLayout: baseLabelLayout,
  }) : baseLabelLayout, [labelOptions, projectedNeighborhoods, baseLabelLayout, activeNeigh]);

  const selectFromList = (n) => {
    if (Number.isFinite(n.svgCoords?.x) && Number.isFinite(n.svgCoords?.y)) {
      setCamera(prev => ({ x: n.svgCoords.x, y: n.svgCoords.y, zoom: Math.max(prev.zoom, 1.8) }));
    }
    onSelectNeighborhood(n);
  };

  const visibleRecordsKey = operationLayer === 'people' ? 'plans' : operationLayer;
  const selectedRecords = operationReady ? operationMetrics.recordsById?.[selectedNeighborhoodId]?.[visibleRecordsKey] || [] : [];
  const visibleRecordLimit = recordScope === `${selectedNeighborhoodId}/${operationLayer}` ? recordLimit : 12;

  return (
    <section className="syp-district-neigh-map-container" aria-label={`${districtName} mahalle haritası`}>
      <div className="syp-neigh-map-header-bar">
        <div className="syp-neigh-map-title-wrap">
          <span className="syp-neigh-map-eyebrow">İLÇE HARİTASI</span>
          <h3 className="syp-neigh-map-title">{districtName}<span>{neighborhoods.length} mahalle</span></h3>
        </div>
        <div className="syp-neigh-map-actions">
          <div className="syp-neigh-view-tabs" role="group" aria-label="Harita odağı">
            <button type="button" className="syp-nvt-btn" onClick={handleFocusDistrict}>Tüm ilçe</button>
            {selectedNeigh?.svgCoords && <button type="button" className="syp-nvt-btn" onClick={handleFocusNeighborhood}>Seçime odaklan</button>}
          </div>
          <button type="button" className={`syp-neigh-text-control ${labelsEnabled ? 'is-active' : ''}`}
            aria-pressed={labelsEnabled} aria-label="Otomatik mahalle etiketleri"
            title="Etiketleri mevcut boşluğa göre göster" onClick={() => setLabelsEnabled(!labelsEnabled)}>
            <TagIcon aria-hidden="true" /> <span>Etiketler</span>
          </button>
          <button ref={listToggleRef} type="button" className={`syp-neigh-text-control ${listOpen ? 'is-active' : ''}`}
            aria-expanded={listOpen} aria-controls={`${mapId}-list`} onClick={() => setListOpen(!listOpen)}>
            <ListBulletIcon aria-hidden="true" /> Mahalle listesi
          </button>
          <div className="syp-neigh-map-zoom-controls" role="group" aria-label="Yakınlaştırma">
            <button type="button" className="syp-neigh-ctrl-btn" onClick={handleZoomOut} aria-label="Uzaklaş" disabled={camera.zoom <= 0.75}><MagnifyingGlassMinusIcon aria-hidden="true" /></button>
            <button type="button" className="syp-neigh-ctrl-btn" onClick={handleZoomIn} aria-label="Yakınlaş" disabled={camera.zoom >= 5}><MagnifyingGlassPlusIcon aria-hidden="true" /></button>
            <button type="button" className="syp-neigh-ctrl-btn" onClick={handleFocusDistrict} aria-label="Haritayı sıfırla"><ArrowPathIcon aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      <div className="syp-neigh-operation-toolbar">
        <div className="syp-neigh-layer-tabs" role="group" aria-label="Mahalle operasyon katmanı">
          {NEIGHBORHOOD_LAYERS.map(layer => <button key={layer.id} type="button" aria-pressed={operationLayer === layer.id}
            onClick={() => setOperationLayer(layer.id)}>{layer.label}</button>)}
        </div>
        <div className="syp-neigh-operation-context"><span>{unitLabel}</span><span>{operationMetrics?.from ? `${operationMetrics.from} – ${operationMetrics.to}` : 'Dönem seçilmedi'}</span></div>
        <p>{activeLayer.note}</p>
      </div>
      <div className="syp-neigh-operation-totals" aria-live="polite">
        <span>İlçe toplamı <strong>{operationReady ? `${operationMetrics.district[operationLayer]} ${activeLayer.unit}` : operationStatus}</strong></span>
        <span>Yalnız ilçe bilgisi <strong>{operationReady ? operationMetrics.districtOnly[operationLayer] : '—'}</strong></span>
        {operationReady && operationMetrics.unmatched[operationLayer] > 0 && <span>Mahallesi eşleşmeyen <strong>{operationMetrics.unmatched[operationLayer]}</strong></span>}
        {coverageNote && <span className="syp-neigh-coverage-note">{coverageNote}</span>}
      </div>
      <div className="syp-neigh-map-body">
        <div ref={containerRef}
          className={`syp-neigh-map-canvas-wrap ${isDragging ? 'is-dragging' : ''} ${isWheelZoomActive ? 'is-zoom-active' : ''}`}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
          <div className="syp-neigh-north" aria-label="Kuzey"><span>↑</span>K</div>
          <div className="syp-neigh-zoom-badge">{Math.round(camera.zoom * 100)}%</div>
          <svg viewBox={currentView.viewBoxStr} className="syp-neigh-map-svg" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`${mapId}-water`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--nm-water-start)" /><stop offset="100%" stopColor="var(--nm-water-end)" />
              </linearGradient>
              <linearGradient id={`${mapId}-land`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--nm-land-start)" /><stop offset="100%" stopColor="var(--nm-land-end)" />
              </linearGradient>
              <pattern id={`${mapId}-missing-boundary`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform={`scale(${currentView.viewW / dimensions.width})`}>
                <path d="M0 6L6 0" stroke="var(--nm-shore)" strokeWidth=".6" opacity=".3" />
              </pattern>
            </defs>
            <rect x={currentView.viewX} y={currentView.viewY} width={currentView.viewW} height={currentView.viewH} fill={`url(#${mapId}-water)`} />
            <path d={activeGeo.path} fill="none" stroke="var(--nm-shore)" strokeWidth="7" vectorEffect="non-scaling-stroke" opacity="0.12" />
            <path d={activeGeo.path} fill={`url(#${mapId}-land)`} stroke="var(--nm-shore)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <path d={activeGeo.path} fill={`url(#${mapId}-missing-boundary)`} />
            {(boundaryData?.features || []).map(feature => {
              const n = neighborhoods.find(item => item.id === feature.id);
              if (!n) return null;
              const level = neighborhoodColorLevel(operationMetrics?.byId[n.id]?.[operationLayer], colorScale, operationReady);
              return <path key={feature.id} d={feature.path} fillRule="evenodd" data-neighborhood-id={n.id}
                className={`syp-neigh-boundary level-${level} ${n.id === selectedNeighborhoodId ? 'is-selected' : ''} ${n.id === activeNeigh?.id ? 'is-hovered' : ''}`}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => setHoveredNeigh(n)} onMouseLeave={() => setHoveredNeigh(null)}
                onClick={() => onSelectNeighborhood(n)}>
                <title>{n.name} · {metricText(n.id)}</title>
              </path>;
            })}
          </svg>
          <div className="syp-neigh-html-layer">
            {projectedNeighborhoods.filter(n => n.x >= 0 && n.x <= dimensions.width && n.y >= 0 && n.y <= dimensions.height).map(n => {
              const label = labelLayout.get(n.id);
              const isSelected = n.id === selectedNeighborhoodId;
              const isActive = n.id === activeNeigh?.id;
              return <div key={n.id}
                className={`syp-html-neigh-pin-wrap ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-hovered' : ''} ${n.hasBoundary ? 'has-boundary' : ''}`}
                style={{ transform: `translate3d(${n.x}px, ${n.y}px, 0)`, zIndex: isActive ? 40 : isSelected ? 30 : 10 }}
                onMouseEnter={() => setHoveredNeigh(n)} onMouseLeave={() => setHoveredNeigh(null)}>
                <button type="button" className="syp-neigh-pin" aria-label={`${n.name} Mahallesini seç · ${metricText(n.id)}`} aria-pressed={isSelected}
                  onClick={() => onSelectNeighborhood(n)} onFocus={() => { setHoveredNeigh(null); setFocusedId(n.id); }} onBlur={() => setFocusedId(null)}>
                  <span className="syp-html-neigh-dot" />
                </button>
                {label && <button type="button" className="syp-neigh-label" tabIndex={-1}
                  style={{ left: label.x - n.x, top: label.y - n.y, width: label.width, height: label.height }}
                  onClick={() => onSelectNeighborhood(n)} aria-label={`${n.name} Mahallesini seç`}>
                  {n.name}
                </button>}
              </div>;
            })}
          </div>
          {boundaryState.status !== 'ready' && <div className="syp-neigh-boundary-notice" role="status">
            {boundaryState.status === 'loading' ? 'Mahalle sınırları yükleniyor…' : <>{boundaryState.error} <button type="button" onClick={boundaryState.retry}>Yeniden dene</button></>}
          </div>}
          {!projectedNeighborhoods.length && <div className="syp-neigh-map-empty">Mahalle konum verisi bekleniyor.</div>}
        </div>

        {listOpen && <aside id={`${mapId}-list`} className="syp-neigh-directory" aria-label="Mahalle listesi"
          onKeyDown={e => { if (e.key === 'Escape') { setListOpen(false); listToggleRef.current?.focus(); } }}>
          <div className="syp-neigh-directory-head">
            <strong>Mahalleler</strong>
            <span>{filteredNeighborhoods.length} / {neighborhoods.length}</span>
            <button type="button" aria-label="Mahalle listesini kapat" onClick={() => { setListOpen(false); listToggleRef.current?.focus(); }}><XMarkIcon aria-hidden="true" /></button>
          </div>
          <label className="syp-neigh-search">
            <MagnifyingGlassIcon aria-hidden="true" />
            <input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Mahalle ara…" aria-label="Mahalle ara" />
          </label>
          <div className="syp-neigh-directory-rows">
            {filteredNeighborhoods.length ? <ul>{filteredNeighborhoods.map(n => <li key={n.id}>
              <button type="button" className={`syp-neigh-directory-item ${n.id === selectedNeighborhoodId ? 'is-selected' : ''}`}
                aria-pressed={n.id === selectedNeighborhoodId} onClick={() => selectFromList(n)}
                onMouseEnter={() => setHoveredNeigh(n)} onMouseLeave={() => setHoveredNeigh(null)}
                onFocus={() => { setHoveredNeigh(null); setFocusedId(n.id); }} onBlur={() => setFocusedId(null)}>
                <MapPinIcon aria-hidden="true" /><span className="syp-neigh-directory-name">{n.name}<small>{metricText(n.id)}{boundaryData && !n.hasBoundary ? ' · Sınır eşleşmedi' : ''}</small></span>
                {n.id === selectedNeighborhoodId && <span className="syp-neigh-selected-dot" aria-hidden="true" />}
              </button>
              {onOpenNeighborhood && <button type="button" className="syp-neigh-open-detail" onClick={() => onOpenNeighborhood(n)} aria-label={`${n.name} mahalle detayını aç`}><ChevronRightIcon aria-hidden="true" /></button>}
            </li>)}</ul> : <p className="syp-neigh-search-empty" role="status">Bu adla mahalle bulunamadı.</p>}
          </div>
        </aside>}
      </div>

      <div className="syp-neigh-map-legend" aria-label="Harita renk açıklaması">
        <strong>{activeLayer.label}</strong>
        {operationReady ? <><span><i className="level-0" />0</span>{colorScale.thresholds.map((start,i) => <span key={start}><i className={`level-${i+1}`} />{start === (colorScale.thresholds[i+1] || colorScale.max+1)-1 ? start : `${start}–${(colorScale.thresholds[i+1] || colorScale.max+1)-1}`}</span>)}</>
          : <span><i className="level--1" />{operationStatus}</span>}
        <span><i className="is-missing" />Sınır eşleşmesi yok</span>
        <span className="syp-neigh-legend-note">Renkler kayıt sayısını gösterir; alan/nüfus yoğunluğu değildir.</span>
      </div>
      <div className="syp-neigh-map-footer">
        <div className="syp-neigh-preview" aria-live="polite" aria-atomic="true">
          <MapPinIcon aria-hidden="true" />
          {previewNeigh ? <div><strong>{previewNeigh.name} <span className="syp-neigh-preview-metric">{metricText(previewNeigh.id)}</span></strong><span>{previewNeigh.hasBoundary ? 'Mahalle alanı · Ayrıntılar için seçin' : 'Muhtarlık referans noktası · Mahalle sınırı eşleşmedi'}</span></div>
            : <div><strong>Mahalleleri keşfedin</strong><span>Bilgileri görmek için bir mahalle alanını seçin veya mahalle listesini açın.</span></div>}
        </div>
        {selectedNeigh && onOpenNeighborhood && <button type="button" className="syp-neigh-detail-link" onClick={() => onOpenNeighborhood(selectedNeigh)}>Mahalle detayı <ChevronRightIcon aria-hidden="true" /></button>}
      </div>
      {selectedNeigh && <section className="syp-neigh-selected-operations" aria-label={`${selectedNeigh.name} operasyon kayıtları`}>
        <div className="syp-neigh-selected-metrics">{NEIGHBORHOOD_LAYERS.map(l => <span key={l.id}>{l.label}<strong>{operationReady ? operationMetrics.byId[selectedNeigh.id]?.[l.id] ?? 0 : '—'}</strong></span>)}</div>
        <details key={`${selectedNeighborhoodId}/${operationLayer}`}>
          <summary>{activeLayer.label} · {operationReady ? `${selectedRecords.length} kaynak kaydı` : operationStatus}</summary>
          {operationReady && <><ul>{selectedRecords.slice(0, visibleRecordLimit).map((record, i) => <li key={record.recordId || record.id || i}>
            <span><strong>{record.baslik || record.adSoyad || record.name || record.gorevYeri || 'Görev planı'}</strong><small>{record.tarih || 'Aktif envanter'}{record.gorevYeri ? ` · ${record.gorevYeri}` : ''}</small></span>
            {onOpenRecord && <button type="button" onClick={() => onOpenRecord(visibleRecordsKey, record)}>Kaydı aç <ChevronRightIcon aria-hidden="true" /></button>}
          </li>)}</ul>{!selectedRecords.length && <p>Seçili kapsamda kayıt yok.</p>}
          {selectedRecords.length > visibleRecordLimit && <button type="button" onClick={() => { setRecordScope(`${selectedNeighborhoodId}/${operationLayer}`); setRecordLimit(visibleRecordLimit + 12); }}>Daha fazla kayıt göster</button>}</>}
        </details>
      </section>}
      <div className="syp-neigh-map-caption">
        <span>{labelsEnabled ? 'Etiketler yakınlık ve boşluğa göre gösterilir.' : 'Etiketler gizli · Seçili ve odaktaki mahalle görünür.'}</span>
        <span className="map-zoom-scroll-indicator" role={showScrollHint ? 'status' : undefined}>{isWheelZoomActive ? 'Yakınlaştırma aktif · Çıkmak için imleci harita dışına taşıyın' : showScrollHint ? 'Tekerlekle yakınlaştırmak için haritaya tıklayın' : 'Sürükleyin veya + / − ile yakınlaşın'}</span>
      </div>
      <details className="syp-neigh-source-info">
        <summary>{boundaryData ? `${boundaryData.features.length} / ${neighborhoods.length} mahalle sınırı eşleşti` : 'Sınır kaynağı'} · © OpenStreetMap contributors · Kaynak ve kapsam</summary>
        <p>Sınırlar: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>{boundaryData ? ` · Veri tarihi: ${boundaryData.sourceTimestamp.slice(0, 10)}` : ''}. Topluluk kaynaklı referans sınırlar; kurum onaylı idari sınır değildir.</p>
        <p>Muhtarlık noktaları: İBB açık veri kataloğu. Alan üzerindeki etiketler mahalleyi temsil eder; personelin konumunu göstermez. Mahallesi belirtilmeyen kayıtlar yalnız ilçe toplamına katılır. Aynı kişi farklı mahallelerde görevliyse ilçe toplamında bir kez sayılır.</p>
        {boundaryData?.missingIds.length > 0 && <p>Sınırı eşleşmeyen mahalleler: {neighborhoods.filter(n => boundaryData.missingIds.includes(n.id)).map(n => n.name).join(', ')}.</p>}
        {boundaryData && <a href={`/map/neighborhoods/${encodeURIComponent(districtSlug)}.json`} download={`${districtSlug}-mahalle-sinirlari.json`}>Sınır verisini indir (ODbL)</a>}
      </details>
      {closestNeighbors.length > 0 && <div className="syp-neigh-nearby">
        <span>Yakındaki mahalleler</span>
        {closestNeighbors.map(n => <button key={n.id} type="button" onClick={() => selectFromList(n)}
          onMouseEnter={() => setHoveredNeigh(n)} onMouseLeave={() => setHoveredNeigh(null)}
          onFocus={() => { setHoveredNeigh(null); setFocusedId(n.id); }} onBlur={() => setFocusedId(null)}>{n.name}<span>~{n.distKm}</span></button>)}
      </div>}
    </section>
  );
}

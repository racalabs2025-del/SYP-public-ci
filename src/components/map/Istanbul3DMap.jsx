import { wheelScale } from '../../utils/mapViewport.js';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ISTANBUL_DISTRICTS_DATA, DISTRICTS_BY_ID } from '../../data/istanbulDistrictsData.js';
import { getDistrictNeighborhoods } from '../../data/istanbulNeighborhoodsData.js';
import { useTheme } from '../../context/themeState.js';
import MapLayerSelector from './MapLayerSelector.jsx';
import './Istanbul3DMap.css';

// ═══════════════════════════════════════════════════════════════════════════════
// SABİTLER VE KAMERA AYARLARI
// ═══════════════════════════════════════════════════════════════════════════════

// SVG 1200×620 → Three.js X-Z düzlem dönüşümü (Harita merkezi 0,0)
const MAP_OFFSET_X = -600;
const MAP_OFFSET_Z = -310;

// Büyük yüzölçümlü / ana ilçeler
const MAJOR_DISTRICT_IDS = new Set([
  'silivri', 'catalca', 'arnavutkoy', 'buyukcekmece', 'basaksehir', 'eyupsultan',
  'sariyer', 'beykoz', 'sile', 'cekmekoy', 'umraniye', 'pendik', 'tuzla',
  'kadikoy', 'uskudar', 'fatih', 'bakirkoy', 'esenyurt',
]);

// Kamera varsayılanları — Mimari İzometrik Açı
const DEFAULT_CAM = { x: 0, y: 540, z: 280 };
const DEFAULT_TARGET = { x: 0, y: 0, z: 10 };
const CAM_FOV = 25;
const CAM_NEAR = 10;
const CAM_FAR = 5000;
const ZOOM_MIN = 180;
const ZOOM_MAX = 4500;

// Yumuşak, kenarsız su düzlemi için radyal alfa dokusu üretici
function createWaterAlphaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 120, 256, 256, 256);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.85, 'rgba(255, 255, 255, 0.3)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// 3D Blok ve Yükselme Parametreleri
const BASE_EXTRUSION_DEPTH = 6;
const HERO_ELEVATION = 42; // Uzaya çıkıyormuş gibi görkemli yükselme mesafesi

// ═══════════════════════════════════════════════════════════════════════════════
// TEMAYA DUYARLI KURUMSAL RENK PALETİ VE GÖKYÜZÜ
// ═══════════════════════════════════════════════════════════════════════════════

function createSkyTexture(isDark) {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 512);
  if (isDark) {
    skyGrad.addColorStop(0, '#090e1a');
    skyGrad.addColorStop(0.5, '#0b152d');
    skyGrad.addColorStop(1, '#060a14');
  } else {
    skyGrad.addColorStop(0, '#dbeafe');
    skyGrad.addColorStop(0.5, '#f0f7fd');
    skyGrad.addColorStop(1, '#f8fafc');
  }
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 512);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  return skyTex;
}

function computeDistrictColor(district, selectedLayer, selectedSeflik, liveMetrics, isDark = true) {
  if (selectedSeflik && selectedSeflik !== 'Tüm Şeflikler') {
    const hasUnit = district.unitBreakdown?.some((u) =>
      u.name.toLowerCase().includes(selectedSeflik.toLowerCase()) ||
      selectedSeflik.toLowerCase().includes(u.name.toLowerCase())
    );
    if (!hasUnit) return isDark ? 0x0f172a : 0xf1f5f9;
  }

  const dMetrics = liveMetrics?.metricsByDistrictId?.[district.id] || null;
  const normScore = liveMetrics?.normalizedScores?.[district.id] ?? null;

  // Dark / Light Kurumsal Yoğunluk Paleti
  const high = isDark ? 0x38bdf8 : 0x0284c7; // Canlı açık cyan/mavi
  const mid = isDark ? 0x0284c7 : 0x2563eb;  // Orta mavi
  const low = isDark ? 0x0369a1 : 0x3b82f6;  // Düşük operasyon mavisi
  const base = isDark ? 0x1e3050 : 0x94b1d3; // Boş/temel renk (koyu şık arduvaz / açık doygun gri-mavi)

  // A live map must not silently fall back to the sample district statistics.
  if (liveMetrics && (!dMetrics || dMetrics.dataStatus === 'UNAVAILABLE')) return base;
  const sample = liveMetrics ? {} : district;

  if (selectedLayer === 'Genel Operasyon Yoğunluğu') {
    if (normScore !== null) {
      if (normScore >= 75) return high;
      if (normScore >= 45) return mid;
      if (normScore >= 20) return low;
      return base;
    }
    switch (sample.density) {
      case 'yuksek': return high;
      case 'orta': return mid;
      default: return base;
    }
  }

  if (selectedLayer === 'Personel Yoğunluğu') {
    const c = dMetrics?.personnel?.active ?? sample.personelCount ?? 0;
    if (c >= 30) return high;
    if (c >= 15) return mid;
    if (c > 0) return low;
    return base;
  }

  if (selectedLayer === 'Başvuru Yoğunluğu') {
    const c = dMetrics?.applications?.open ?? (dMetrics?.applications?.total ?? sample.basvuruCount ?? 0);
    if (c >= 100) return high;
    if (c >= 30) return mid;
    if (c > 0) return low;
    return base;
  }

  if (selectedLayer === 'Aktif Operasyonlar' || selectedLayer === 'Aktif Operasyon') {
    const c = dMetrics?.shifts?.today ?? sample.activeOperations ?? 0;
    if (c >= 10) return high;
    if (c >= 4) return mid;
    if (c > 0) return low;
    return base;
  }

  if (selectedLayer === 'Kronik Sorunlar' || selectedLayer === 'Takip Edilen İşler') {
    const c = dMetrics?.chronicIssues?.count ?? sample.chronicIssuesCount ?? 0;
    if (c >= 5) return high;
    if (c >= 2) return mid;
    if (c > 0) return low;
    return base;
  }

  if (selectedLayer === 'Meydanlar') {
    const mCount = dMetrics?.squares?.count ?? sample.meydanCount ?? 0;
    if (mCount >= 5) return high;
    if (mCount >= 2) return mid;
    if (mCount > 0) return low;
    return base;
  }

  if (selectedLayer === 'Birim Aktivitesi' || selectedLayer === 'Gerçekleşen Çalışmalar') {
    const uCount = selectedLayer === 'Gerçekleşen Çalışmalar' ? dMetrics?.activities?.count ?? 0 : dMetrics?.units ?? sample.activeUnitsCount ?? sample.unitBreakdown?.length ?? 0;
    if (uCount >= 4) return high;
    if (uCount >= 2) return mid;
    if (uCount > 0) return low;
    return base;
  }

  return mid;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function Istanbul3DMap({
  selectedDistrictId = null,
  onSelectDistrict = () => {},
  selectedNeighborhoodId = null,
  onSelectNeighborhood = () => {},
  selectedLayer = 'Genel Operasyon Yoğunluğu',
  onSelectLayer = () => {},
  availableLayers,
  selectedSeflik = 'Tüm Şeflikler',
  liveMetrics = null,
  onSwitchTo2D = null,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark'));
  const navigate = useNavigate();
  const location = useLocation();
  const wrapperRef = useRef(null);
  const mountRef = useRef(null);
  const labelsContainerRef = useRef(null);
  const labelDomsRef = useRef(new Map());
  const neighLabelDomsRef = useRef(new Map());

  // Harita Tekerlek (Zoom) Kontrolü — Sayfa kaydırma ile harita zoom çakışmasını önleme
  const [isWheelZoomActive, setIsWheelZoomActive] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const isWheelZoomActiveRef = useRef(false);
  const scrollHintTimeoutRef = useRef(null);

  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [viewAngle, setViewAngle] = useState('isometric');
  const [webglError, setWebglError] = useState(false);
  const initialSceneConfig = useRef({ isDark, selectedLayer, selectedSeflik, liveMetrics });

  // Mahalle Durumları
  const [internalNeighId, setInternalNeighId] = useState(null);
  const selectedNeighId = selectedNeighborhoodId !== null && selectedNeighborhoodId !== undefined
    ? selectedNeighborhoodId
    : internalNeighId;

  const [hoveredNeigh, setHoveredNeigh] = useState(null);
  const [neighSearch, setNeighSearch] = useState('');
  const [isNeighSidebarOpen, setIsNeighSidebarOpen] = useState(true);

  // Seçili ilçenin mahalleleri
  const districtNeighborhoods = useMemo(() => {
    if (!selectedDistrictId) return [];
    return getDistrictNeighborhoods(selectedDistrictId);
  }, [selectedDistrictId]);

  const districtNeighborhoodsRef = useRef([]);
  useEffect(() => { districtNeighborhoodsRef.current = districtNeighborhoods; }, [districtNeighborhoods]);

  const handleSelectNeigh = useCallback((neighOrId) => {
    const nid = typeof neighOrId === 'object' && neighOrId ? neighOrId.id : (neighOrId || null);
    const neighObj = typeof neighOrId === 'object' ? neighOrId : (districtNeighborhoods.find((n) => n.id === nid) || null);
    setInternalNeighId(nid);
    if (onSelectNeighborhood) {
      onSelectNeighborhood(neighObj);
    }
  }, [districtNeighborhoods, onSelectNeighborhood]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { setInternalNeighId(null); setNeighSearch(''); });
    return () => cancelAnimationFrame(frame);
  }, [selectedDistrictId]);

  const filteredNeighborhoods = useMemo(() => {
    if (!neighSearch.trim()) return districtNeighborhoods;
    const q = neighSearch.toLocaleLowerCase('tr-TR');
    return districtNeighborhoods.filter(
      (n) =>
        n.name.toLocaleLowerCase('tr-TR').includes(q) ||
        n.muhtarlikName?.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [districtNeighborhoods, neighSearch]);

  const selectedNeigh = useMemo(() => {
    if (!selectedNeighId) return null;
    return districtNeighborhoods.find((n) => n.id === selectedNeighId) || null;
  }, [selectedNeighId, districtNeighborhoods]);

  // Three.js dahili nesneleri
  const internals = useRef({
    scene: null,
    camera: null,
    renderer: null,
    animId: null,
    ambientLight: null,
    mainSun: null,
    skyFill: null,
    waterMat: null,
    skyTex: null,
    groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    meshes: new Map(),
    lines: new Map(),
    footprints: new Map(),
    districtCenters: new Map(),
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(-1000, -1000),
    camTarget: new THREE.Vector3(DEFAULT_TARGET.x, DEFAULT_TARGET.y, DEFAULT_TARGET.z),
    _selectedId: null,
    _hoveredId: null,
    _selectedNeighId: null,
    _hoveredNeighId: null,
    _isDragging: false,
    _hasDragged: false,
  });

  const selectedDistrict = selectedDistrictId ? DISTRICTS_BY_ID[selectedDistrictId] : null;
  useEffect(() => { internals.current._selectedId = selectedDistrictId; }, [selectedDistrictId]);
  useEffect(() => { internals.current._selectedNeighId = selectedNeighId; }, [selectedNeighId]);
  useEffect(() => { internals.current._hoveredNeighId = hoveredNeigh?.id || null; }, [hoveredNeigh]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT 1 — THREE.JS SAHNE KURULUMU
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const container = mountRef.current;
    if (!container || webglError) return;

    const w = container.clientWidth || 1100;
    const h = container.clientHeight || 600;
    const I = internals.current;
    const { isDark, selectedLayer, selectedSeflik, liveMetrics } = initialSceneConfig.current;

    // 1. Scene
    const scene = new THREE.Scene();

    // Yüksek Kalite: Gradyan Arka Plan (Temaya Duyarlı)
    const skyTex = createSkyTexture(isDark);
    scene.background = skyTex;
    I.skyTex = skyTex;
    I.scene = scene;

    // 2. Camera — Telephoto İzometrik
    const camera = new THREE.PerspectiveCamera(CAM_FOV, w / h, CAM_NEAR, CAM_FAR);
    camera.position.set(DEFAULT_CAM.x, DEFAULT_CAM.y, DEFAULT_CAM.z);
    camera.lookAt(DEFAULT_TARGET.x, DEFAULT_TARGET.y, DEFAULT_TARGET.z);
    I.camera = camera;

    // 3. Renderer
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
      });
    } catch {
      skyTex.dispose();
      I.scene = null;
      I.camera = null;
      I.skyTex = null;
      const errorFrame = requestAnimationFrame(() => setWebglError(true));
      return () => cancelAnimationFrame(errorFrame);
    }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 0.96 : 1.12;
    container.appendChild(renderer.domElement);
    I.renderer = renderer;

    // Yüksek Kalite: Çevresel Yansıma (Environment Map)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
    scene.environment = environmentTarget.texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();

    let disposed = false;
    let isInViewport = true;
    let contextLost = false;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    function requestRender() {
      if (disposed || contextLost || document.hidden || !isInViewport || I.animId !== null) return;
      I.animId = requestAnimationFrame(animate);
    }
    I.requestRender = requestRender;

    // Native antialiasing keeps geographic edges clear without per-frame SSAO/bloom passes.

    // 4. Işıklandırma (Temaya Duyarlı)
    const ambientLight = new THREE.AmbientLight(
      isDark ? 0x38bdf8 : 0xf8fafc,
      isDark ? 0.45 : 0.85
    );
    scene.add(ambientLight);
    I.ambientLight = ambientLight;

    const mainSun = new THREE.DirectionalLight(
      isDark ? 0x93c5fd : 0xffffff,
      isDark ? 0.70 : 0.85
    );
    mainSun.position.set(150, 700, 200);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.set(2048, 2048);
    mainSun.shadow.camera.near = 50;
    mainSun.shadow.camera.far = 1500;
    mainSun.shadow.camera.left = -750;
    mainSun.shadow.camera.right = 750;
    mainSun.shadow.camera.top = 550;
    mainSun.shadow.camera.bottom = -550;
    mainSun.shadow.bias = -0.0003;
    scene.add(mainSun);
    I.mainSun = mainSun;

    const skyFill = new THREE.DirectionalLight(
      isDark ? 0x1e3a8a : 0xe0f2fe,
      isDark ? 0.35 : 0.45
    );
    skyFill.position.set(-200, 400, -200);
    scene.add(skyFill);
    I.skyFill = skyFill;

    // 5. Su Düzlemi (Temaya Duyarlı Kurumsal Deniz)
    const waterGeo = new THREE.PlaneGeometry(3600, 2600, 1, 1);
    const waterAlphaTex = createWaterAlphaTexture();
    const waterMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x0c1e3d : 0xdbeafe,
      roughness: isDark ? 0.4 : 0.3,
      metalness: isDark ? 0.2 : 0.05,
      alphaMap: waterAlphaTex,
      transparent: true,
      opacity: isDark ? 0.88 : 0.95,
      depthWrite: false,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1.5;
    water.receiveShadow = true;
    scene.add(water);
    I.water = water;
    I.waterMat = waterMat;
    I.waterAlphaTex = waterAlphaTex;

    // 6. 39 İlçe Geometrisi
    const loader = new SVGLoader();
    const transformMatrix = new THREE.Matrix4().set(
      1, 0, 0, MAP_OFFSET_X,
      0, 0, 1, 0,
      0, 1, 0, MAP_OFFSET_Z,
      0, 0, 0, 1
    );

    ISTANBUL_DISTRICTS_DATA.forEach((district) => {
      try {
        const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${district.path}" /></svg>`;
        const parsed = loader.parse(svgDoc);
        if (!parsed.paths?.length) return;

        const shapes = SVGLoader.createShapes(parsed.paths[0]);
        if (!shapes?.length) return;

        const extGeo = new THREE.ExtrudeGeometry(shapes, {
          depth: BASE_EXTRUSION_DEPTH,
          bevelEnabled: false,
          bevelSegments: 4,
          steps: 1,
          bevelSize: 0.6,
          bevelThickness: 0.5,
        });
        extGeo.applyMatrix4(transformMatrix);
        extGeo.computeVertexNormals();

        const baseColor = computeDistrictColor(district, selectedLayer, selectedSeflik, liveMetrics, isDark);

        // Yüksek Kalite: Premium "Glass/Sleek" Material (MeshPhysicalMaterial)
        const mat = new THREE.MeshPhysicalMaterial({
          color: baseColor,
          metalness: isDark ? 0.25 : 0.1,
          roughness: isDark ? 0.35 : 0.2,
          clearcoat: isDark ? 0.7 : 1.0,
          clearcoatRoughness: 0.25,
          transparent: true,
          opacity: 0.98,
        });

        const mesh = new THREE.Mesh(extGeo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // İlçe Kontur / Sınır Çizgisi (Net geometrik hatlar)
        const edges = new THREE.EdgesGeometry(extGeo, 28);
        const lineMat = new THREE.LineBasicMaterial({
          color: isDark ? 0x38bdf8 : 0x0284c7,
          transparent: true,
          opacity: isDark ? 0.55 : 0.6,
        });
        const line = new THREE.LineSegments(edges, lineMat);
        mesh.add(line);
        I.lines.set(district.id, line);
        mesh.userData = {
          districtId: district.id,
          districtName: district.name,
          district,
          targetY: 0,
          targetScale: 1.0,
          targetOpacity: 1.0,
          baseColor,
        };

        scene.add(mesh);
        I.meshes.set(district.id, mesh);

        // İlçe Merkez Noktası (HTML Etiket projeksiyonu için)
        if (district.center) {
          I.districtCenters.set(
            district.id,
            new THREE.Vector3(
              district.center.x + MAP_OFFSET_X,
              BASE_EXTRUSION_DEPTH + 1,
              district.center.y + MAP_OFFSET_Z
            )
          );
        }

        // Footprint (Seçili ilçe taban izi / hologram soketi)
        const fpGeo = new THREE.ShapeGeometry(shapes);
        fpGeo.applyMatrix4(transformMatrix);
        const fpMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const fp = new THREE.Mesh(fpGeo, fpMat);
        fp.position.y = 0.1;
        scene.add(fp);
        I.footprints.set(district.id, fp);
      } catch (err) {
        console.warn(`3D geo error ${district.id}:`, err);
      }
    });

    // Fit geometry to the actual viewport instead of using a fixed camera distance.
    I.fitView = (top = false) => {
      const box = new THREE.Box3();
      I.meshes.forEach((mesh, id) => {
        if (I._selectedId && id !== I._selectedId) return;
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox.clone();
        if (I._selectedId) bounds.translate(new THREE.Vector3(0, HERO_ELEVATION, 0));
        box.union(bounds);
      });
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      if (I._selectedId) {
        center.x += 140; // Shift camera target right so the district appears on the left
        center.z -= 70;  // Shift camera target up (North) so the district appears lower, avoiding top badges
      }
      const direction = new THREE.Vector3(0, 1, top ? 0.001 : 0.5).normalize();
      const right = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const tanY = Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
      const tanX = tanY * camera.aspect;
      let distance = ZOOM_MIN;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(distance, offset.dot(direction) + Math.max(Math.abs(offset.dot(right)) / tanX, Math.abs(offset.dot(up)) / tanY) * 1.18);
      }
      I.camTarget.copy(center);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      I.fitted = true;
      I.topView = top;
      requestRender();
    };
    I.fitView();
    I.zoomBy = (factor, anchor = I.camTarget) => {
      const distance = camera.position.distanceTo(I.camTarget);
      const next = THREE.MathUtils.clamp(distance / factor, ZOOM_MIN, ZOOM_MAX);
      const t = 1 - next / distance;
      camera.position.lerp(anchor, t);
      I.camTarget.lerp(anchor, t);
      camera.updateMatrixWorld();
      I.fitted = false;
      requestRender();
    };

    // ═══════════════════════════════════════════════════════════
    // GERÇEK 1:1 ZEMİN TUTMA & SERBEST KAYDIRMA SİSTEMİ
    // ═══════════════════════════════════════════════════════════
    const grabPoint = new THREE.Vector3();
    const currentHit = new THREE.Vector3();
    const panPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const panRay = new THREE.Raycaster();

    function getGroundIntersection(clientX, clientY, targetVec) {
      const rect = container.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
      panRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      return panRay.ray.intersectPlane(panPlane, targetVec);
    }

    function onPointerDown(e) {
      if (!e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
      // Haritaya tıklandığı an zoom yetkisi aktifleşir
      isWheelZoomActiveRef.current = true;
      setIsWheelZoomActive(true);
      setShowScrollHint(false);
      setHoveredDistrict(null);

      I._isDragging = true;
      I._hasDragged = false;
      I._dragStartX = e.clientX;
      I._dragStartY = e.clientY;

      getGroundIntersection(e.clientX, e.clientY, grabPoint);
      container.style.cursor = 'grabbing';
    }

    function onPointerMove(e) {
      if (!I._isDragging) return;

      const dx = e.clientX - I._dragStartX;
      const dy = e.clientY - I._dragStartY;

      if (!I._hasDragged && Math.hypot(dx, dy) > 4) {
        I._hasDragged = true;
      }

      const hit = getGroundIntersection(e.clientX, e.clientY, currentHit);
      if (hit && grabPoint) {
        const delta = new THREE.Vector3().subVectors(grabPoint, currentHit);
        const next = I.camTarget.clone().add(delta);
        next.x = THREE.MathUtils.clamp(next.x, -650, 650);
        next.z = THREE.MathUtils.clamp(next.z, -350, 350);
        delta.copy(next).sub(I.camTarget);
        camera.position.add(delta);
        I.camTarget.copy(next);
        camera.updateMatrixWorld();
        I.fitted = false;
        requestRender();
      }
    }

    function onPointerUp() {
      if (I._isDragging) {
        I._isDragging = false;
        container.style.cursor = 'grab';
      }
    }

    function onPointerLeave() {
      isWheelZoomActiveRef.current = false;
      setIsWheelZoomActive(false);
      setShowScrollHint(false);
      setHoveredDistrict(null);
      I._hoveredId = null;
      I.meshes.forEach((mesh, id) => {
        if (id !== I._selectedId) mesh.material.emissiveIntensity = 0;
      });
      requestRender();
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
      if (I._isDragging) {
        I._isDragging = false;
        container.style.cursor = 'grab';
      }
    }

    function onWindowPointerDown(e) {
      const wrap = wrapperRef.current || container;
      if (wrap && !wrap.contains(e.target)) {
        isWheelZoomActiveRef.current = false;
        setIsWheelZoomActive(false);
        setShowScrollHint(false);
      }
    }

    function onWheel(e) {
      // The neighborhood list and layer selector retain their own scrolling.
      if (e.target.closest?.('.map-3d-neigh-sidepanel, .map-3d-top-bar, .map-3d-controls')) return;
      if (!isWheelZoomActiveRef.current) {
        // Zoom aktif değil: Kullanıcı sayfada aşağı/yukarı kaydırıyor, sayfa scrollunu serbest bırak!
        setShowScrollHint(true);
        if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
        scrollHintTimeoutRef.current = setTimeout(() => {
          setShowScrollHint(false);
        }, 1800);
        return;
      }

      // Zoom aktif: Sayfa kaymasını engelle ve Three.js haritasını yakınlaştır/uzaklaştır
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hit = new THREE.Vector3();
      if (!rc.ray.intersectPlane(panPlane, hit)) return;
      I.zoomBy(wheelScale(e.deltaY, e.deltaMode, rect.height), hit);
    }

    function onContextMenu(e) { e.preventDefault(); }

    const wrapper = wrapperRef.current;
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    container.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointerdown', onWindowPointerDown);
    if (wrapper) {
      wrapper.addEventListener('pointerleave', onPointerLeave);
      wrapper.addEventListener('wheel', onWheel, { passive: false });
    }

    function onResize() {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // Resizing the workspace preserves the user's camera; fitting is explicit.
      setHoveredDistrict(null);
      requestRender();
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // ═══════════════════════════════════════════════════════════
    // ANİMASYON DÖNGÜSÜ (Uzaya Çıkma & Geri Dönüş Animasyonu)
    // ═══════════════════════════════════════════════════════════
    const projVec = new THREE.Vector3();

    function animate() {
      I.animId = null;
      if (disposed || contextLost || document.hidden || !isInViewport) return;
      let isAnimating = false;
      const approach = (current, target) => {
        if (motionPreference.matches || Math.abs(target - current) < 0.001) return target;
        isAnimating = true;
        return current + (target - current) * 0.08;
      };

      const isAnySelected = !!I._selectedId;

      // 1. İlçelerin 3D animasyonlu hareketi (Yükselme, Küçülme)
      I.meshes.forEach((mesh) => {
        const targetY = mesh.userData.targetY ?? 0;
        mesh.position.y = approach(mesh.position.y, targetY);

        const targetScale = mesh.userData.targetScale ?? 1.0;
        const curScale = mesh.scale.x;
        const newScale = approach(curScale, targetScale);
        mesh.scale.set(newScale, newScale, newScale);

        const targetOp = mesh.userData.targetOpacity ?? 1.0;
        mesh.material.opacity = approach(mesh.material.opacity, targetOp);
        mesh.visible = mesh.material.opacity > 0.015;
      });

      // 2. Footprint taban izleri
      I.footprints.forEach((fp, id) => {
        const isSelected = I._selectedId === id;
        const targetFpOp = isSelected ? 0.8 : 0;
        fp.material.opacity = approach(fp.material.opacity, targetFpOp);
        fp.visible = fp.material.opacity > 0.01;
      });

      // Project labels with the same camera/world matrices used by this frame.
      camera.lookAt(I.camTarget);
      camera.updateMatrixWorld();
      scene.updateMatrixWorld(true);

      // 3. HTML Etiketlerini DİREKT DOM ile güncelle
      const rect = container.getBoundingClientRect();
      const rw = rect.width;
      const rh = rect.height;
      const camDist = camera.position.distanceTo(I.camTarget);
      const isFar = camDist > 700;

      I.districtCenters.forEach((center, id) => {
        const dom = labelDomsRef.current.get(id);
        if (!dom) return;

        const isHovered = I._hoveredId === id;
        const isMajor = MAJOR_DISTRICT_IDS.has(id);

        if (isAnySelected) {
          dom.style.opacity = '0';
          dom.style.pointerEvents = 'none';
          return;
        } else if (isFar && !isMajor && !isHovered) {
          dom.style.opacity = '0';
          dom.style.pointerEvents = 'none';
          return;
        }

        const mesh = I.meshes.get(id);
        const curY = mesh ? mesh.position.y : 0;

        projVec.copy(center);
        projVec.y += curY;
        projVec.project(camera);

        if (projVec.z >= -1 && projVec.z < 1) {
          const sx = Math.round((projVec.x * 0.5 + 0.5) * rw);
          const sy = Math.round((-projVec.y * 0.5 + 0.5) * rh);

          dom.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
          dom.style.opacity = '1';
          dom.style.pointerEvents = 'auto';
        } else {
          dom.style.opacity = '0';
          dom.style.pointerEvents = 'none';
        }
      });

      // 5. Seçili ilçe varsa MAHALLELERİNİ DİREKT DOM ile güncelle (Çakışma Kontrolü)
      if (I._selectedId && districtNeighborhoodsRef.current.length > 0) {
        const mesh = I.meshes.get(I._selectedId);
        const activeBoxes = [];
        const LABEL_WIDTH = 110;
        const LABEL_HEIGHT = 28;
        const projections = [];

        districtNeighborhoodsRef.current.forEach((neigh) => {
          const dom = neighLabelDomsRef.current.get(neigh.id);
          if (!dom || !neigh.svgCoords) return;

          projVec.set(
            neigh.svgCoords.x + MAP_OFFSET_X,
            BASE_EXTRUSION_DEPTH + 1.2,
            neigh.svgCoords.y + MAP_OFFSET_Z
          );
          if (mesh) projVec.applyMatrix4(mesh.matrixWorld);
          projVec.project(camera);

          if (projVec.z >= -1 && projVec.z < 1) {
            const sx = Math.round((projVec.x * 0.5 + 0.5) * rw);
            const sy = Math.round((-projVec.y * 0.5 + 0.5) * rh);
            const isSel = I._selectedNeighId === neigh.id;
            const isHov = I._hoveredNeighId === neigh.id;
            const score = isSel ? 3 : isHov ? 2 : 1;
            projections.push({ neigh, dom, sx, sy, score });
          } else {
            dom.style.opacity = '0';
            dom.style.pointerEvents = 'none';
          }
        });

        // Skor sırasına göre diz (Önce seçili, sonra hover, sonra diğerleri)
        projections.sort((a, b) => b.score - a.score);

        projections.forEach((proj) => {
          let hasCollision = false;
          // Sadece diğer etiketler için çakışma kontrolü yap (seçili ve hover her zaman görünsün)
          if (proj.score < 2) {
            for (const box of activeBoxes) {
              if (Math.abs(box.x - proj.sx) < LABEL_WIDTH && Math.abs(box.y - proj.sy) < LABEL_HEIGHT) {
                hasCollision = true;
                break;
              }
            }
          }

          if (!hasCollision) {
            activeBoxes.push({ x: proj.sx, y: proj.sy });
            proj.dom.style.transform = `translate3d(${proj.sx}px, ${proj.sy}px, 0) translate(-50%, -50%)`;
            proj.dom.style.opacity = '1';
            proj.dom.style.pointerEvents = 'auto';
            proj.dom.style.zIndex = proj.score === 3 ? '50' : proj.score === 2 ? '45' : '22';
          } else {
            proj.dom.style.opacity = '0';
            proj.dom.style.pointerEvents = 'none';
          }
        });
      }

      // 6. Render
      camera.lookAt(I.camTarget);
      renderer.render(scene, camera);
      if (isAnimating) requestRender();
    }
    function onVisibilityChange() {
      if (document.hidden || !isInViewport) {
        if (I.animId !== null) cancelAnimationFrame(I.animId);
        I.animId = null;
      } else requestRender();
    }
    function onContextLost(event) {
      event.preventDefault();
      contextLost = true;
      setWebglError(true);
    }
    const visibilityObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      isInViewport = entry.isIntersecting;
      onVisibilityChange();
    });
    visibilityObserver?.observe(container);
    document.addEventListener('visibilitychange', onVisibilityChange);
    motionPreference.addEventListener('change', requestRender);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    requestRender();

    return () => {
      disposed = true;
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerdown', onWindowPointerDown);
      if (wrapper) {
        wrapper.removeEventListener('pointerleave', onPointerLeave);
        wrapper.removeEventListener('wheel', onWheel);
      }
      if (scrollHintTimeoutRef.current) clearTimeout(scrollHintTimeoutRef.current);
      resizeObserver.disconnect();
      visibilityObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionPreference.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      if (I.animId !== null) cancelAnimationFrame(I.animId);
      scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material?.dispose());
      });
      mainSun.shadow.dispose();
      environmentTarget.dispose();
      if (I.waterAlphaTex) I.waterAlphaTex.dispose();
      if (I.skyTex) I.skyTex.dispose();
      renderer.dispose();
      I.meshes.clear();
      I.lines.clear();
      I.footprints.clear();
      I.districtCenters.clear();
      I.animId = null;
      I.scene = null;
      I.camera = null;
      I.renderer = null;
      I.fitView = null;
      I.zoomBy = null;
      I.requestRender = null;
      I._isDragging = false;
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [webglError]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT 2 — RENK VE TEMA GÜNCELLEMESİ (Katman/Şeflik/Canlı Veri/Dark Mode)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const I = internals.current;
    if (!I.scene) return;

    // 1. Sky Texture
    if (I.skyTex) I.skyTex.dispose();
    const newSky = createSkyTexture(isDark);
    I.scene.background = newSky;
    I.skyTex = newSky;

    // 2. Water
    if (I.waterMat) {
      I.waterMat.color.setHex(isDark ? 0x0c1e3d : 0xdbeafe);
      I.waterMat.opacity = isDark ? 0.88 : 0.95;
    }

    // 3. Lighting
    if (I.ambientLight) {
      I.ambientLight.color.setHex(isDark ? 0x38bdf8 : 0xf8fafc);
      I.ambientLight.intensity = isDark ? 0.45 : 0.85;
    }
    if (I.mainSun) {
      I.mainSun.color.setHex(isDark ? 0x93c5fd : 0xffffff);
      I.mainSun.intensity = isDark ? 0.70 : 0.85;
    }
    if (I.skyFill) {
      I.skyFill.color.setHex(isDark ? 0x1e3a8a : 0xe0f2fe);
      I.skyFill.intensity = isDark ? 0.35 : 0.45;
    }
    if (I.renderer) {
      I.renderer.toneMappingExposure = isDark ? 0.96 : 1.12;
    }

    // 4. Update Meshes & Lines
    I.meshes.forEach((mesh, id) => {
      const district = DISTRICTS_BY_ID[id];
      if (!district) return;

      const color = computeDistrictColor(district, selectedLayer, selectedSeflik, liveMetrics, isDark);
      mesh.userData.baseColor = color;

      if (id !== selectedDistrictId) {
        mesh.material.color.setHex(color);
      }
      const line = I.lines?.get(id);
      if (line) {
        line.material.color.setHex(isDark ? 0x38bdf8 : 0x0284c7);
        line.material.opacity = isDark ? 0.55 : 0.6;
      }
    });
    I.requestRender?.();
  }, [isDark, selectedLayer, selectedSeflik, liveMetrics, selectedDistrictId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT 3 — UZAYA ÇIKMA VE GERİ DÖNÜŞ ANİMASYONU
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const I = internals.current;

    // Animasyonun (yükselme ve derinlik) hissedilebilmesi için ilçe seçildiğinde İzometrik açıya geç
    if (selectedDistrictId && viewAngle === 'top') {
      setViewAngle('isometric');
      I.topView = false;
    }

    I.meshes.forEach((mesh, id) => {
      const isSelected = selectedDistrictId === id;

      if (isSelected) {
        // SEÇİLEN İLÇE: 3D uzaya yükselir (+42px), parıldayan kurumsal maviye bürünür
        mesh.userData.targetY = HERO_ELEVATION;
        mesh.userData.targetScale = 1.0;
        mesh.userData.targetOpacity = 1.0;
        mesh.material.color.setHex(0x0284c7);
        mesh.material.emissive.setHex(0x0369a1);
        mesh.material.emissiveIntensity = 0.3; // sabit vurgu
      } else if (selectedDistrictId) {
        // ARKADA KALAN İSTANBUL: Daha düşük vurguyla görünür kalır
        mesh.userData.targetY = -2;
        mesh.userData.targetScale = 1.0;
        mesh.userData.targetOpacity = 0.45;
        mesh.material.emissive.setHex(0x000000);
        mesh.material.emissiveIntensity = 0;
      } else {
        // SEÇİM KALKTI: Tüm harita eski yerine yükselir ve orijinal boyutuna döner
        mesh.userData.targetY = 0;
        mesh.userData.targetScale = 1.0;
        mesh.userData.targetOpacity = 1.0;
        mesh.material.color.setHex(mesh.userData.baseColor);
        mesh.material.emissive.setHex(0x000000);
        mesh.material.emissiveIntensity = 0;
      }
    });
    I.fitView?.(I.topView);
  }, [selectedDistrictId, viewAngle]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT 4 — HOVER SENKRONİZASYONU
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const I = internals.current;
    I._hoveredId = hoveredDistrict?.id || null;
    I.meshes.forEach((mesh, id) => {
      if (id === selectedDistrictId) return;
      mesh.material.emissive.setHex(id === I._hoveredId ? 0x0284c7 : 0x000000);
      mesh.material.emissiveIntensity = id === I._hoveredId ? 0.3 : 0;
    });
    I.requestRender?.();
  }, [hoveredDistrict, selectedDistrictId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUSE — RAYCAST (Hover & Tıklama)
  // ═══════════════════════════════════════════════════════════════════════════
  const handlePointerMove = useCallback((e) => {
    const container = mountRef.current;
    const I = internals.current;
    if (!container || !I.camera || I._isDragging) return;

    const wrap = wrapperRef.current || container;
    const wrapRect = wrap.getBoundingClientRect();
    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    I.mouse.set(x, y);

    setTooltipPos({ x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top, width: wrapRect.width, height: wrapRect.height });

    I.raycaster.setFromCamera(I.mouse, I.camera);
    // Sadece görünür durumdaki mesh'leri raycast'e dahil et
    const visibleMeshes = Array.from(I.meshes.values()).filter((m) => m.visible);
    const intersects = I.raycaster.intersectObjects(visibleMeshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const hitDistrict = hitMesh.userData.district;
      setHoveredDistrict((prev) => (prev?.id === hitDistrict.id ? prev : hitDistrict));
      container.style.cursor = 'pointer';

    } else {
      setHoveredDistrict((prev) => (prev ? null : prev));
      container.style.cursor = 'grab';
    }
  }, []);

  const handleClick = useCallback((e) => {
    const container = mountRef.current;
    const I = internals.current;
    if (!container || !I.camera) return;

    if (I._hasDragged) return;
    const rect = container.getBoundingClientRect();
    I.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);

    I.raycaster.setFromCamera(I.mouse, I.camera);
    const visibleMeshes = Array.from(I.meshes.values()).filter((m) => m.visible);
    const intersects = I.raycaster.intersectObjects(visibleMeshes, false);

    if (intersects.length > 0) {
      const hitDistrict = intersects[0].object.userData.district;
      if (selectedDistrictId === hitDistrict.id) {
        // Zaten seçili olan ilçenin alanına tıklandı:
        // Eğer mahalle seçiliyse hemen tüm ilçelere dönme, önce mahalleyi kapatıp ilçe ekranına dön!
        if (selectedNeighId) {
          handleSelectNeigh(null);
        }
      } else {
        handleSelectNeigh(null);
        onSelectDistrict(hitDistrict);
      }
    } else {
      // Haritanın boş alanına (suya / arka plana) tıklandı:
      if (selectedNeighId) {
        // 1. Tıklama: Mahalle seçiliyse hemen tüm ilçelere dönme, altta ilçe ekranı açılsın!
        handleSelectNeigh(null);
      } else if (selectedDistrictId) {
        // 2. Tıklama: Tekrar tıklama olursa tüm ilçeler İstanbul haritası açılsın!
        onSelectDistrict(null);
      }
    }
  }, [selectedDistrictId, selectedNeighId, onSelectDistrict, handleSelectNeigh]);

  // ═══════════════════════════════════════════════════════════════════════════
  // KAMERA KONTROL BUTONLARI
  // ═══════════════════════════════════════════════════════════════════════════
  const handleResetCamera = useCallback(() => {
    const I = internals.current;
    if (!I.camera) return;
    I.fitView?.(false);
    setViewAngle('isometric');
  }, []);

  const handleTopView = useCallback(() => {
    const I = internals.current;
    if (!I.camera) return;
    I.fitView?.(true);
    setViewAngle('top');
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // JSX RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (webglError) {
    return (
      <div className="istanbul-3d-map-wrapper map-3d-unavailable" role="status">
        <strong>3D harita görüntülenemiyor</strong>
        <p>Grafik bağlantısı kurulamadı. 2D haritada çalışmaya devam edebilirsiniz.</p>
        {onSwitchTo2D && <button type="button" className="map-3d-btn" onClick={onSwitchTo2D}>2D haritaya geç</button>}
      </div>
    );
  }
  return (
    <div
      ref={wrapperRef}
      className={`istanbul-3d-map-wrapper ${isWheelZoomActive ? 'is-zoom-active' : ''} ${isDark ? 'is-dark' : ''}`}
      onPointerDown={() => {
        isWheelZoomActiveRef.current = true;
        setIsWheelZoomActive(true);
        setShowScrollHint(false);
      }}
      onPointerLeave={() => {
        isWheelZoomActiveRef.current = false;
        setIsWheelZoomActive(false);
        setShowScrollHint(false);
      }}
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
      <div className="map-3d-top-bar">
        <MapLayerSelector
          selectedLayer={selectedLayer}
          onSelectLayer={onSelectLayer}
          availableLayers={availableLayers}
          is3D={true}
        />

        {selectedDistrict ? (
          <div className="map-3d-status-badge is-active">
            <span className="map-3d-status-dot is-selected" />
            <span className="map-3d-status-text">
              {selectedNeigh ? (
                <>
                  Seçili: <strong>{selectedNeigh.name}</strong> ({selectedDistrict.name})
                </>
              ) : (
                <>
                  Seçili: <strong>{selectedDistrict.name.toUpperCase()}</strong> (Geri dönmek için boşluğa tıklayın)
                </>
              )}
            </span>
            {selectedNeigh ? (
              <button
                type="button"
                className="map-3d-reset-btn"
                onClick={() => handleSelectNeigh(null)}
                title="Mahalle seçimini kaldır ve ilçe ekranına dön"
              >
                ✕ İlçeye Dön
              </button>
            ) : (
              <button
                type="button"
                className="map-3d-reset-btn"
                onClick={() => onSelectDistrict(null)}
                title="Haritayı eski haline getir"
              >
                ✕ Geri Dön
              </button>
            )}
          </div>
        ) : (
          <div className="map-3d-status-badge">
            <span className="map-3d-status-dot is-overview" />
            <span className="map-3d-status-text">
              3D Harita · İlçeye tıklayarak odaklanın
            </span>
          </div>
        )}

        {onSwitchTo2D && (
          <button
            type="button"
            className="map-3d-mode-switch-btn"
            onClick={onSwitchTo2D}
            title="2D Haritaya Geç"
          >
            🗺️ 2D Harita
          </button>
        )}
      </div>

      {/* WebGL Canvas Sahnesi */}
      <div
        ref={mountRef}
        className="istanbul-3d-canvas-container"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredDistrict(null)}
        onClick={handleClick}
        role="region"
        aria-label="Üç Boyutlu İstanbul İlçe Haritası"
      />

      {/* Sıfır Titremeli HTML İlçe Etiket Katmanı */}
      <div ref={labelsContainerRef} className="map-3d-html-labels-layer" aria-hidden="true">
        {ISTANBUL_DISTRICTS_DATA.map((d) => {
          const isSelected = selectedDistrictId === d.id;
          const isHovered = hoveredDistrict?.id === d.id;
          const isMajor = MAJOR_DISTRICT_IDS.has(d.id);

          return (
            <div
              key={d.id}
              ref={(el) => {
                if (el) labelDomsRef.current.set(d.id, el);
                else labelDomsRef.current.delete(d.id);
              }}
              className={`map-3d-html-label ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''} ${isMajor ? 'is-large' : ''}`}
              onPointerEnter={(e) => {
                const rect = wrapperRef.current.getBoundingClientRect();
                setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height });
                setHoveredDistrict((prev) => (prev?.id === d.id ? prev : d));
              }}
              onPointerLeave={() => setHoveredDistrict((prev) => (prev ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDistrict(isSelected ? null : d);
              }}
            >
              <span className="map-3d-label-dot" />
              <span className="map-3d-label-text">{d.name}</span>
            </div>
          );
        })}
      </div>

      {/* SEÇİLİ İLÇE MAHALLELERİ 3D HTML ETİKET KATMANI */}
      {selectedDistrictId && (
        <div className="map-3d-neigh-labels-layer">
          {districtNeighborhoods.map((n) => {
            const isSelected = selectedNeighId === n.id;
            const isHovered = hoveredNeigh?.id === n.id;

            return (
              <div
                key={n.id}
                ref={(el) => {
                  if (el) neighLabelDomsRef.current.set(n.id, el);
                  else neighLabelDomsRef.current.delete(n.id);
                }}
                className={`map-3d-neigh-pin-wrap ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectNeigh(isSelected ? null : n);
                }}
                onMouseEnter={() => setHoveredNeigh(n)}
                onMouseLeave={() => setHoveredNeigh(null)}
                title={`${n.name} Mahallesi (${n.muhtarlikName})`}
              >
                <span className="map-3d-neigh-dot" />
                <span className="map-3d-neigh-label">{n.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* SAĞ TARAF: SEÇİLİ İLÇENİN MAHALLELERİ LİSTESİ PANELİ */}
      {selectedDistrictId && (
        <div className={`map-3d-neigh-sidepanel ${isNeighSidebarOpen ? 'is-open' : 'is-collapsed'}`}>
          <div className="map-3d-nsp-header">
            <div className="map-3d-nsp-title-group">
              <span className="map-3d-nsp-pre">{selectedDistrict?.name?.toUpperCase()} MAHALLELERİ</span>
              <span className="map-3d-nsp-count">{districtNeighborhoods.length} Mahalle</span>
            </div>
            <button
              type="button"
              className="map-3d-nsp-toggle-btn"
              onClick={() => setIsNeighSidebarOpen(!isNeighSidebarOpen)}
              title={isNeighSidebarOpen ? 'Paneli Daralt' : 'Paneli Genişlet'}
              aria-expanded={isNeighSidebarOpen}
              aria-label={isNeighSidebarOpen ? 'Mahalle panelini daralt' : 'Mahalle panelini genişlet'}
            >
              {isNeighSidebarOpen ? '▶' : '◀'}
            </button>
          </div>

          {isNeighSidebarOpen && (
            <>
              {/* Aktif Veri ve Operasyon Özeti */}
              {(() => {
                const dMetrics = liveMetrics?.metricsByDistrictId?.[selectedDistrictId] || null;
                const m = (section, key, fallback) => liveMetrics
                  ? (section?.dataStatus === 'UNAVAILABLE' ? '—' : section?.[key] ?? '0')
                  : (fallback ?? '—');

                return (
                  <div className="map-3d-nsp-summary">
                    <div className="map-3d-nsp-layer-info">
                      Aktif Katman: <strong>{availableLayers?.find((l) => l.id === selectedLayer)?.name || 'Genel Görünüm'}</strong>
                    </div>
                    <div className="map-3d-nsp-metrics-grid">
                      <div className="map-3d-nsp-metric">
                        <span className="nsp-mlabel">👥 Personel</span>
                        <strong className="nsp-mval">{m(dMetrics?.personnel, 'active', selectedDistrict.personelCount)}</strong>
                      </div>
                      <div className="map-3d-nsp-metric">
                        <span className="nsp-mlabel">📅 Görev Planı</span>
                        <strong className="nsp-mval">{m(dMetrics?.shifts, 'today', selectedDistrict.activeOperations)}</strong>
                      </div>
                      <div className="map-3d-nsp-metric">
                        <span className="nsp-mlabel">🏛️ Aktif Birim</span>
                        <strong className="nsp-mval">{dMetrics?.units ?? (liveMetrics ? '0' : selectedDistrict.activeUnitsCount ?? '—')}</strong>
                      </div>
                      <div className="map-3d-nsp-metric">
                        <span className="nsp-mlabel">📋 Takip Edilen İş</span>
                        <strong className="nsp-mval">{m(dMetrics?.chronicIssues, 'count', selectedDistrict.chronicIssuesCount)}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="map-3d-nsp-district-detail-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Either navigate to district detail page or scroll to the district context section below the map
                        const target = document.querySelector('.syp-district-context-section');
                        if (target) {
                           target.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      title={`${selectedDistrict?.name} Detaylarını Gör`}
                    >
                      İlçe Dosyasına İlerle ↓
                    </button>
                  </div>
                );
              })()}

              {/* Arama Kutusu */}
              <div className="map-3d-nsp-search-wrap">
                <input
                  type="text"
                  className="map-3d-nsp-search-input"
                  placeholder="Mahalle ara..."
                  aria-label="Mahalle ara"
                  value={neighSearch}
                  onChange={(e) => setNeighSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                {neighSearch && (
                  <button
                    type="button"
                    className="map-3d-nsp-clear-btn"
                    aria-label="Mahalle aramasını temizle"
                    onClick={() => setNeighSearch('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Seçili Mahalle Vurgu Kartı */}
              {selectedNeigh && (
                <div className="map-3d-nsp-active-card">
                  <div className="map-3d-nac-top">
                    <span className="map-3d-nac-title">{selectedNeigh.name}</span>
                    <button
                      type="button"
                      className="map-3d-nac-close"
                      onClick={() => handleSelectNeigh(null)}
                      title="Seçimi Temizle ve İlçeye Dön"
                    >
                      ✕
                    </button>
                  </div>
                  <span className="map-3d-nac-muhtar">🏛️ {selectedNeigh.muhtarlikName}</span>
                  <span className="map-3d-nac-addr">📍 {selectedNeigh.address}</span>
                  <button
                    type="button"
                    className="map-3d-nac-open-btn"
                    onClick={() => navigate(`/ilce/${selectedDistrictId}/mahalle/${selectedNeigh.slug}${location.search}`)}
                  >
                    <span>Mahalle Ekranını Aç</span>
                    <span>→</span>
                  </button>
                </div>
              )}

              {/* Mahalle Listesi */}
              <div className="map-3d-nsp-list">
                {filteredNeighborhoods.length === 0 && <p className="map-3d-no-results">{neighSearch ? 'Aramanızla eşleşen mahalle bulunamadı.' : 'Bu ilçe için mahalle verisi bulunamadı.'}</p>}
                {filteredNeighborhoods.map((n) => {
                  const isSel = n.id === selectedNeighId;
                  return (
                    <div
                      key={n.id}
                      className={`map-3d-nsp-item ${isSel ? 'is-selected' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectNeigh(isSel ? null : n);
                      }}
                      onMouseEnter={() => setHoveredNeigh(n)}
                      onMouseLeave={() => setHoveredNeigh(null)}
                    >
                      <div className="map-3d-nsp-item-info">
                        <span className="map-3d-nsp-item-name">{n.name}</span>
                        <span className="map-3d-nsp-item-muhtar">{n.muhtarlikName}</span>
                      </div>
                      <button
                        type="button"
                        className="map-3d-nsp-item-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/ilce/${selectedDistrictId}/mahalle/${n.slug}${location.search}`);
                        }}
                        title={`${n.name} mahalle ekranını aç`}
                      >
                        Mahalleyi göster →
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Yüzen Hover Tooltip (Gelişmiş Operasyonel İlçe Balonu) */}
      {!selectedDistrictId && hoveredDistrict && (() => {
        const dMetrics = liveMetrics?.metricsByDistrictId?.[hoveredDistrict.id] || null;
        const metric = (section, key, sample) => liveMetrics
          ? (section?.dataStatus === 'UNAVAILABLE' ? '—' : section?.[key] ?? '—')
          : (sample ?? '—');
        const pCount = metric(dMetrics?.personnel, 'active', hoveredDistrict.personelCount);
        const bCount = metric(dMetrics?.shifts, 'today', hoveredDistrict.activeOperations);
        const uCount = dMetrics?.units ?? (liveMetrics ? '—' : hoveredDistrict.activeUnitsCount ?? '—');
        const cCount = metric(dMetrics?.chronicIssues, 'count', hoveredDistrict.chronicIssuesCount);
        const score = liveMetrics?.normalizedScores?.[hoveredDistrict.id];
        const density = liveMetrics
          ? (Number.isFinite(score) ? (score >= 75 ? 'yuksek' : score >= 45 ? 'orta' : 'dusuk') : null)
          : hoveredDistrict.density;

        // Viewport taşmasını önlemek için akıllı konumlandırma
        const tooltipWidth = Math.min(270, Math.max(0, tooltipPos.width - 16));
        const posX = Math.max(8, Math.min(tooltipPos.x + 15, tooltipPos.width - tooltipWidth - 8));
        const posY = Math.max(8, Math.min(tooltipPos.y + 15, tooltipPos.height - 210));

        return (
          <div
            className="map-3d-floating-tooltip"
            style={{
              left: `${posX}px`,
              top: `${posY}px`,
              width: `${tooltipWidth}px`,
            }}
          >
            <div className="map-3d-tooltip-card">
              <div className="map-3d-tooltip-header">
                <div className="map-3d-tooltip-title-group">
                  <span className="map-3d-tooltip-pin-dot" />
                  <span className="map-3d-tooltip-title">{hoveredDistrict.name}</span>
                  <span className="map-3d-tooltip-yaka">
                    {hoveredDistrict.yaka === 'anadolu' ? 'Anadolu' : 'Avrupa'}
                  </span>
                </div>
                {density && <div className={`map-3d-tooltip-badge is-${density}`}>
                  <span className="map-3d-badge-dot" />
                  <span>
                    {density === 'yuksek' ? 'Yüksek' : density === 'orta' ? 'Orta' : 'Düşük'}
                  </span>
                </div>}
              </div>

              <div className="map-3d-tooltip-metrics-grid">
                <div className="map-3d-metric-box">
                  <span className="map-3d-metric-label">👥 Planlanan Personel</span>
                  <strong className="map-3d-metric-val">{pCount}</strong>
                </div>
                <div className="map-3d-metric-box">
                  <span className="map-3d-metric-label">📅 Görev Planı</span>
                  <strong className="map-3d-metric-val">{bCount}</strong>
                </div>
                <div className="map-3d-metric-box">
                  <span className="map-3d-metric-label">🏛️ Aktif Birim</span>
                  <strong className="map-3d-metric-val">{uCount}</strong>
                </div>
                <div className="map-3d-metric-box">
                  <span className="map-3d-metric-label">📋 Takip Edilen İş</span>
                  <strong className="map-3d-metric-val">{cCount}</strong>
                </div>
              </div>

              <div className="map-3d-tooltip-hint">İlçe detayları için tıklayın ↗</div>
            </div>
          </div>
        );
      })()}

      {/* Sol Alt Kamera Kontrolleri */}
      <div className="map-3d-controls">
        <button type="button" className="map-3d-btn" aria-label="Haritayı yakınlaştır" onClick={() => internals.current.zoomBy?.(1.25)}>+</button>
        <button type="button" className="map-3d-btn" aria-label="Haritayı uzaklaştır" onClick={() => internals.current.zoomBy?.(0.8)}>−</button>
        <button type="button" className="map-3d-btn" onClick={() => internals.current.fitView?.(internals.current.topView)}>Görünüme sığdır</button>
        <button
          type="button"
          className={`map-3d-btn ${viewAngle === 'isometric' ? 'is-active' : ''}`}
          onClick={handleResetCamera}
          title="İzometrik 3D Açı"
        >
          ⟲ 3D İzometrik
        </button>
        <button
          type="button"
          className={`map-3d-btn ${viewAngle === 'top' ? 'is-active' : ''}`}
          onClick={handleTopView}
          title="Üstten Bakış"
        >
          ⤓ Üstten
        </button>
      </div>

      {/* Sağ Alt Yoğunluk Göstergesi */}
      <div className="map-3d-legend">
        <span>Yoğunluk:</span>
        <div className="map-3d-legend-bar" />
        <div className="map-3d-legend-labels">
          <span>Düşük</span>
          <span>→</span>
          <span>Yüksek</span>
        </div>
      </div>
    </div>
  );
}

// ---- 3D Box Customizer (full file, revised) ----
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const wrap = document.getElementById("canvas-wrap");
const skuListEl = document.getElementById("sku-list");
const metaEl = document.getElementById("meta");
const loadingEl = document.getElementById("loading");

const dimensionPanel = document.getElementById("dimension-panel");
const dimWInput = document.getElementById("dim-w");
const dimHInput = document.getElementById("dim-h");
const dimDInput = document.getElementById("dim-d");
const updateDimsBtn = document.getElementById("update-dims-btn");

const editPanel = document.getElementById("edit-panel");
const textInput = document.getElementById("text-input");
const addTextBtn = document.getElementById("add-text-btn");
const imageInput = document.getElementById("image-input");
const posXInput = document.getElementById("pos-x");
const posYInput = document.getElementById("pos-y");
const rotationInput = document.getElementById("rotation");
const scaleInput = document.getElementById("scale");
const deleteDecalBtn = document.getElementById("delete-decal-btn");
const show2dViewBtn = document.getElementById("show-2d-view-btn");
const twoDViewEl = document.getElementById("two-d-view");
const twoDCanvas = document.getElementById("two-d-canvas");
const backTo3dBtn = document.getElementById("back-to-3d-btn");

let renderer,
  scene,
  camera,
  controls,
  currentMesh,
  currentMats = [],
  raycaster,
  mouse;
let items = [];
let selectedSKU = null;
let selectedFace = null;
let lastDecal = null;
let hasUnsavedChanges = false;
let decals = []; // all decals
let selectedDecal = null; // active selected decal
let isAnimating = false;
let animationStartTime = 0;
const animationDuration = 500; // ms

// --- demo config ---
const cfg = {
  items: [
    {
      sku: "SKU123",
      name: "Kraft Koli - Orta",
      dims: { w: 300, h: 200, d: 220 },
      faces: {
        front: "assets/boxes/SKU123/front.jpg",
        back: "assets/boxes/SKU123/back.jpg",
        left: "assets/boxes/SKU123/left.jpg",
        right: "assets/boxes/SKU123/right.jpg",
        top: "assets/boxes/SKU123/top.jpg",
        bottom: "assets/boxes/SKU123/bottom.jpg",
      },
      thumb: "assets/boxes/SKU123/front.jpg",
    },
    {
      sku: "SKU124",
      name: "Beyaz Koli - Küçük (Tek görsel)",
      dims: { w: 220, h: 160, d: 180 },
      faces: { single: "assets/boxes/SKU124/single.jpg" },
      thumb: "assets/boxes/SKU124/single.jpg",
    },
    {
      sku: "SKU125",
      name: "Küçük Koli",
      dims: { w: 150, h: 100, d: 120 },
      faces: { single: "assets/boxes/SKU124/single.jpg" },
      thumb: "assets/boxes/SKU124/single.jpg",
    },
  ],
};

// ---------------- Helpers for active decal & face ----------------
function getActiveDecal() {
  return selectedDecal || lastDecal || null;
}
function getFaceParamsForDecal(decal) {
  const boxParams = currentMesh.geometry.parameters;
  const matIndex = decal.attachedFaceMaterialIndex;
  const { faceW, faceH } = getFaceSizeForMatIndex(matIndex, boxParams);
  return { faceW, faceH, matIndex, boxParams };
}

// ---------------- Delete Decal ----------------
function onDeleteDecal() {
  if (selectedDecal) {
    scene.remove(selectedDecal);
    selectedDecal.geometry?.dispose();
    selectedDecal.material?.dispose();

    const index = decals.indexOf(selectedDecal);
    if (index > -1) decals.splice(index, 1);

    selectedDecal = null;
    lastDecal = null;
    selectedFace = null;
    editPanel.classList.add("hidden");

    hasUnsavedChanges = decals.length > 0;
  }
}

// ---------- Init ----------
init();
function init() {
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement);

  // Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f7);

  camera = new THREE.PerspectiveCamera(
    55,
    wrap.clientWidth / wrap.clientHeight,
    0.01,
    100
  );
  camera.position.set(1.8, 1.3, 1.8);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0xdedede, 0.7);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 4, 2);
  dir.castShadow = false;
  scene.add(dir);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.2;
  controls.maxDistance = 10;
  controls.target.set(0, 0.35, 0);

  // Picking
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Events
  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("click", onCanvasClick, false);
  updateDimsBtn.addEventListener("click", updateDimensions);
  addTextBtn.addEventListener("click", onAddText);
  imageInput.addEventListener("change", onAddImage);
  deleteDecalBtn.addEventListener("click", onDeleteDecal);
  show2dViewBtn.addEventListener("click", show2DView);
  backTo3dBtn.addEventListener("click", hide2DView);
  posXInput.addEventListener("input", onTransformChange);
  posYInput.addEventListener("input", onTransformChange);
  rotationInput.addEventListener("input", onTransformChange);
  scaleInput.addEventListener("input", onTransformChange);

  // UI + first load
  items = cfg.items || [];
  buildSidebar(items);
  if (items.length) selectSKU(items[0].sku);

  hide2DView();
  animate();
}

// ---------- UI ----------
function buildSidebar(items) {
  skuListEl.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "sku";
    div.dataset.sku = item.sku;
    div.innerHTML = `
      <img src="${
        item.thumb || item.faces?.front || item.faces?.single || ""
      }" alt="">
      <div>
        <div class="name">${item.name || item.sku}</div>
        <div class="dims">${fmtDims(item.dims)}</div>
      </div>
    `;
    div.addEventListener("click", () => selectSKU(item.sku));
    skuListEl.appendChild(div);
  });
}
function setActive(sku) {
  document
    .querySelectorAll(".sku")
    .forEach((el) => el.classList.toggle("active", el.dataset.sku === sku));
}
function showLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
}
function fmtDims(d) {
  if (!d) return "";
  return `${d.w}×${d.h}×${d.d} mm`;
}

// ---------- SKU Load ----------
async function selectSKU(sku) {
  const item = items.find((i) => i.sku === sku);
  if (!item) return;

  if (hasUnsavedChanges) {
    const ok = confirm(
      "Mevcut koli üzerindeki değişiklikler kaydedilmeyecektir. Yeni koliye geçmek istiyor musunuz?"
    );
    if (!ok) return;
  }

  selectedSKU = sku;
  setActive(sku);
  metaEl.textContent = `${item.name || item.sku} — ${fmtDims(item.dims)}`;

  clearDecals();

  showLoading(true);
  await loadItem(item).catch(console.error);
  showLoading(false);

  dimWInput.value = item.dims.w;
  dimHInput.value = item.dims.h;
  dimDInput.value = item.dims.d;
  dimensionPanel.classList.remove("hidden");
}

function updateDimensions() {
  if (!selectedSKU) return;

  const w = parseFloat(dimWInput.value);
  const h = parseFloat(dimHInput.value);
  const d = parseFloat(dimDInput.value);

  if (isNaN(w) || isNaN(h) || isNaN(d) || w <= 0 || h <= 0 || d <= 0) {
    alert("Lütfen geçerli ve pozitif boyutlar girin.");
    return;
  }

  const currentItem = items.find((i) => i.sku === selectedSKU);
  const modifiedItem = { ...currentItem, dims: { w, h, d } };

  metaEl.textContent = `${modifiedItem.name || modifiedItem.sku} — ${fmtDims(
    modifiedItem.dims
  )}`;

  clearDecals();
  showLoading(true);
  loadItem(modifiedItem)
    .catch(console.error)
    .finally(() => {
      showLoading(false);
      dimensionPanel.classList.remove("hidden");
    });
}

function clearDecals() {
  const toRemove = [];
  scene.children.forEach((c) => {
    if (c instanceof THREE.Mesh && c !== currentMesh) toRemove.push(c);
  });
  toRemove.forEach((m) => {
    scene.remove(m);
    m.geometry?.dispose();
    m.material?.dispose();
  });
  decals = [];
  selectedDecal = null;
  lastDecal = null;
  hasUnsavedChanges = false;
  selectedFace = null;

  dimensionPanel.classList.add("hidden");
  editPanel.classList.add("hidden");
  textInput.value = "";
  imageInput.value = "";
  posXInput.value = "0";
  posYInput.value = "0";
  rotationInput.value = "0";
  scaleInput.value = "1";
}

async function loadItem(item) {
  disposeCurrent();

  // mm -> m
  const w = (item.dims?.w || 200) / 1000;
  const h = (item.dims?.h || 200) / 1000;
  const d = (item.dims?.d || 200) / 1000;

  const geo = new THREE.BoxGeometry(w, h, d);

  const loader = new THREE.TextureLoader();
  const faces = normalizeFaces(item.faces);

  // THREE order: right, left, top, bottom, front, back
  const order = ["right", "left", "top", "bottom", "front", "back"];
  currentMats = await Promise.all(
    order.map(async (key) => {
      const url = faces[key];
      if (url) {
        const t = await loadTex(loader, url);
        t.anisotropy = Math.min(
          8,
          renderer.capabilities.getMaxAnisotropy?.() || 4
        );
        t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
          map: t,
          metalness: 0,
          roughness: 0.95,
        });
      }
      return new THREE.MeshStandardMaterial({
        color: 0xb49766,
        metalness: 0,
        roughness: 0.95,
      });
    })
  );

  currentMesh = new THREE.Mesh(geo, currentMats);
  scene.add(currentMesh);

  frameObject(currentMesh);
}

function normalizeFaces(faces = {}) {
  if (faces.single) {
    return {
      right: faces.single,
      left: faces.single,
      top: faces.single,
      bottom: faces.single,
      front: faces.single,
      back: faces.single,
    };
  }
  return {
    right: faces.right || faces.front || null,
    left: faces.left || faces.back || null,
    top: faces.top || faces.front || null,
    bottom: faces.bottom || faces.back || null,
    front: faces.front || faces.right || null,
    back: faces.back || faces.left || null,
  };
}

function loadTex(loader, url) {
  return new Promise((res, rej) =>
    loader.load(
      url,
      (t) => res(t),
      undefined,
      (e) => rej(e)
    )
  );
}

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const fov = camera.fov * (Math.PI / 180);
  let dist = (maxDim * 0.5) / Math.tan(fov / 2);
  dist *= 1.4;

  const dir = new THREE.Vector3(1, 0.7, 1).normalize();
  const pos = center.clone().addScaledVector(dir, dist);

  camera.position.copy(pos);
  controls.target.copy(center);
  controls.update();
}

function disposeCurrent() {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry?.dispose();
    currentMesh = null;
  }
  currentMats.forEach((m) => {
    if (m.map) m.map.dispose();
    m.dispose();
  });
  currentMats = [];
}

// ---------- Resize ----------
function onResize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ---------- Picking & Camera Fly ----------
function onCanvasClick(event) {
  if (isAnimating) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // 1) decals?
  const decalIntersects = raycaster.intersectObjects(decals);
  if (decalIntersects.length > 0) {
    const clickedDecal = decalIntersects[0].object;
    if (selectedDecal && selectedDecal !== clickedDecal) {
      selectedDecal.material.color.set(0xffffff);
    }
    selectedDecal = clickedDecal;
    lastDecal = clickedDecal;
    selectedDecal.material.color.set(0x00ff00); // highlight
    selectedFace = null; // yüzey seçimini temizle

    // inputlara mevcut değerleri yaz
    const rel = selectedDecal.position
      .clone()
      .sub(selectedDecal.initialPosition);
    posXInput.value = rel.dot(selectedDecal.tangent).toFixed(4);
    posYInput.value = rel.dot(selectedDecal.bitangent).toFixed(4);
    rotationInput.value = ((selectedDecal.rotation.z * 180) / Math.PI).toFixed(
      2
    );
    scaleInput.value = selectedDecal.scale.x.toFixed(2);

    updateTransformLimits();
    editPanel.classList.remove("hidden");
    return;
  }

  // 2) box face?
  if (currentMesh) {
    const boxIntersects = raycaster.intersectObject(currentMesh);
    if (boxIntersects.length > 0) {
      if (selectedDecal) selectedDecal.material.color.set(0xffffff);
      selectedDecal = null;

      const faceIndex = boxIntersects[0].faceIndex;
      const materialIndex = Math.floor(faceIndex / 2);

      const boxParams = currentMesh.geometry.parameters;
      const { centerWorld, tangent, bitangent, normal } = getFaceInfo(
        materialIndex,
        boxParams,
        currentMesh
      );

      selectedFace = {
        mesh: currentMesh,
        materialIndex,
        faceNormal: normal,
        point: boxIntersects[0].point,
        center: centerWorld,
        tangent,
        bitangent,
      };

      // edit panel aç
      editPanel.classList.remove("hidden");
      posXInput.value = "0";
      posYInput.value = "0";
      rotationInput.value = "0";
      scaleInput.value = "1";
      updateTransformLimits();

      // yakından göster
      const distance = 0.8;
      const targetPosition = selectedFace.center
        .clone()
        .add(normal.clone().multiplyScalar(distance));
      const targetLookAt = selectedFace.center.clone();
      animateCameraTo(targetPosition, targetLookAt);
      return;
    }
  }

  // 3) boşluk
  if (selectedDecal) selectedDecal.material.color.set(0xffffff);
  selectedDecal = null;
  selectedFace = null;
  editPanel.classList.add("hidden");
}

function animateCameraTo(targetPosition, targetLookAt) {
  isAnimating = true;
  controls.enabled = false;
  animationStartTime = Date.now();

  const startPosition = camera.position.clone();
  const startLookAt = controls.target.clone();

  const step = () => {
    if (!isAnimating) return;
    const t = Math.min(
      1,
      (Date.now() - animationStartTime) / animationDuration
    );
    camera.position.lerpVectors(startPosition, targetPosition, t);
    controls.target.lerpVectors(startLookAt, targetLookAt, t);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
    else {
      isAnimating = false;
      controls.enabled = true;
    }
  };
  step();
}

// ---------- Face helpers (anchor/axes) ----------
function getFaceInfo(materialIndex, boxParams, mesh) {
  const hw = boxParams.width / 2;
  const hh = boxParams.height / 2;
  const hd = boxParams.depth / 2;

  let centerLocal, tangentLocal, bitangentLocal;

  // 0 right(+X),1 left(-X)   -> u: Z, v: Y
  // 2 top(+Y), 3 bottom(-Y)  -> u: X, v: Z
  // 4 front(+Z),5 back(-Z)   -> u: X, v: Y
  switch (materialIndex) {
    case 0: // right
      centerLocal = new THREE.Vector3(+hw, 0, 0);
      tangentLocal = new THREE.Vector3(0, 0, -1);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 1: // left
      centerLocal = new THREE.Vector3(-hw, 0, 0);
      tangentLocal = new THREE.Vector3(0, 0, 1);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 2: // top
      centerLocal = new THREE.Vector3(0, +hh, 0);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 0, -1);
      break;
    case 3: // bottom
      centerLocal = new THREE.Vector3(0, -hh, 0);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 0, 1);
      break;
    case 4: // front
      centerLocal = new THREE.Vector3(0, 0, +hd);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 5: // back
      centerLocal = new THREE.Vector3(0, 0, -hd);
      tangentLocal = new THREE.Vector3(-1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    default:
      centerLocal = new THREE.Vector3(0, 0, 0);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
  }

  const centerWorld = centerLocal.clone();
  mesh.localToWorld(centerWorld);

  const toWorldDir = (v) =>
    v.clone().transformDirection(mesh.matrixWorld).normalize();
  const tangent = toWorldDir(tangentLocal);
  const bitangent = toWorldDir(bitangentLocal);
  const normal = new THREE.Vector3()
    .crossVectors(tangent, bitangent)
    .normalize();

  return { centerWorld, tangent, bitangent, normal };
}

function getFaceSizeForMatIndex(matIndex, boxParams) {
  if (matIndex === 0 || matIndex === 1) {
    return { faceW: boxParams.depth, faceH: boxParams.height };
  } else if (matIndex === 2 || matIndex === 3) {
    return { faceW: boxParams.width, faceH: boxParams.depth };
  } else {
    return { faceW: boxParams.width, faceH: boxParams.height };
  }
}

function rotatedHalfExtents(w, h, theta) {
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  return { halfX: (c * w + s * h) / 2, halfY: (c * h + s * w) / 2 };
}

// ---------- Add Text/Image (Decals as planes) ----------
function onAddText() {
  if (!selectedFace) return;
  const text = textInput.value?.trim();
  if (!text) return;
  addTextDecal(text);
}

function addTextDecal(text) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const canvasSize = 1024; // sharper text
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  context.fillStyle = "rgba(0,0,0,0)";
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.fillStyle = "black";
  context.font = "bold 160px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvasSize / 2, canvasSize / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });

  // Fit to face with margin
  const { faceW, faceH } = getFaceSizeForMatIndex(
    selectedFace.materialIndex,
    currentMesh.geometry.parameters
  );
  const margin = 0.04; // 40mm
  const maxW = Math.max(0.01, faceW - margin * 2);
  const maxH = Math.max(0.01, faceH - margin * 2);
  const base = Math.min(maxW, maxH);

  const geo = new THREE.PlaneGeometry(base, base);
  const decal = new THREE.Mesh(geo, mat);

  decal.position.copy(selectedFace.center);
  decal.lookAt(selectedFace.center.clone().add(selectedFace.faceNormal));
  decal.initialPosition = selectedFace.center.clone();
  decal.tangent = selectedFace.tangent.clone();
  decal.bitangent = selectedFace.bitangent.clone();
  decal.attachedFaceMaterialIndex = selectedFace.materialIndex;

  scene.add(decal);
  decals.push(decal);
  lastDecal = decal;
  selectedDecal = decal;
  hasUnsavedChanges = true;

  // reset inputs
  posXInput.value = "0";
  posYInput.value = "0";
  rotationInput.value = "0";
  scaleInput.value = "1";
  updateTransformLimits();
  editPanel.classList.remove("hidden");
}

function onAddImage(e) {
  if (!selectedFace) return;
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => addImageDecal(ev.target.result);
  reader.readAsDataURL(file);
}

function addImageDecal(imageData) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imageData, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    // Fit to face with margin
    const { faceW, faceH } = getFaceSizeForMatIndex(
      selectedFace.materialIndex,
      currentMesh.geometry.parameters
    );
    const margin = 0.04; // 40mm
    const maxW = Math.max(0.01, faceW - margin * 2);
    const maxH = Math.max(0.01, faceH - margin * 2);

    const imgW = texture.image.width || 1;
    const imgH = texture.image.height || 1;
    const aspect = imgW / imgH;

    let planeW, planeH;
    if (aspect >= 1) {
      planeW = maxW;
      planeH = planeW / aspect;
      if (planeH > maxH) {
        planeH = maxH;
        planeW = planeH * aspect;
      }
    } else {
      planeH = maxH;
      planeW = planeH * aspect;
      if (planeW > maxW) {
        planeW = maxW;
        planeH = planeW / aspect;
      }
    }

    const geo = new THREE.PlaneGeometry(planeW, planeH);
    const decal = new THREE.Mesh(geo, mat);

    decal.position.copy(selectedFace.center);
    decal.lookAt(selectedFace.center.clone().add(selectedFace.faceNormal));
    decal.initialPosition = selectedFace.center.clone();
    decal.tangent = selectedFace.tangent.clone();
    decal.bitangent = selectedFace.bitangent.clone();
    decal.attachedFaceMaterialIndex = selectedFace.materialIndex;

    scene.add(decal);
    decals.push(decal);
    lastDecal = decal;
    selectedDecal = decal;
    hasUnsavedChanges = true;

    posXInput.value = "0";
    posYInput.value = "0";
    rotationInput.value = "0";
    scaleInput.value = "1";
    updateTransformLimits();
    editPanel.classList.remove("hidden");
  });
}

// ---------- 2D View ----------
function show2DView() {
  wrap.classList.add("hidden");
  twoDViewEl.classList.remove("hidden");
  draw2DBox();
}

function hide2DView() {
  wrap.classList.remove("hidden");
  twoDViewEl.classList.add("hidden");
}

function draw2DBox() {
  if (!currentMesh) return;
  const ctx = twoDCanvas.getContext("2d");

  const boxParams = currentMesh.geometry.parameters;
  const w = boxParams.width * 1000; // mm
  const h = boxParams.height * 1000;
  const d = boxParams.depth * 1000;

  // Layout & Flaps
  const flapHeight = d / 1.8;
  const taper = 20;
  const scaleFactor = 1; // decal konumları mm -> canvas

  const layout = {
    5: { x: flapHeight + d, y: d, w: w, h: h }, // Back
    2: { x: flapHeight + d, y: 0, w: w, h: d }, // Top
    3: { x: flapHeight + d, y: d + h, w: w, h: d }, // Bottom
    4: { x: flapHeight + d, y: d + h + d, w: w, h: h }, // Front
    1: { x: flapHeight, y: d, w: d, h: h }, // Left
    0: { x: flapHeight + d + w, y: d, w: d, h: h }, // Right
  };

  const totalWidth = flapHeight + d + w + d + flapHeight;
  const totalHeight = d + h + d + h;

  twoDCanvas.width = totalWidth + 40;
  twoDCanvas.height = totalHeight + 40;

  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
  ctx.clearRect(0, 0, twoDCanvas.width, twoDCanvas.height);
  ctx.translate(20, 20); // padding

  // 1) Face textures
  const promises = [];
  for (let i = 0; i < currentMats.length; i++) {
    const mat = currentMats[i];
    if (mat.map) {
      const img = new Image();
      // Some Three.js images may already be Image/Canvas elements
      if (mat.map.image instanceof HTMLImageElement) {
        img.src = mat.map.image.src;
      } else if (mat.map.image instanceof HTMLCanvasElement) {
        img.src = mat.map.image.toDataURL();
      } else {
        img.src = mat.map.image?.src || "";
      }
      const { x, y, w, h } = layout[i] || {};
      if (x === undefined) continue;
      promises.push(
        new Promise((resolve) => {
          img.onload = () => {
            ctx.drawImage(img, x, y, w, h);
            resolve();
          };
          img.onerror = () => resolve();
        })
      );
    }
  }

  // 2) Flap background (kraft)
  ctx.fillStyle = "#E0C4A0";
  const topFace = layout[2];
  // Left flap
  ctx.beginPath();
  ctx.moveTo(topFace.x, topFace.y);
  ctx.lineTo(topFace.x - flapHeight + taper, topFace.y);
  ctx.lineTo(topFace.x - flapHeight, topFace.y + taper);
  ctx.lineTo(topFace.x - flapHeight, topFace.y + topFace.h - taper);
  ctx.lineTo(topFace.x - flapHeight + taper, topFace.y + topFace.h);
  ctx.lineTo(topFace.x, topFace.y + topFace.h);
  ctx.closePath();
  ctx.fill();
  // Right flap
  ctx.beginPath();
  ctx.moveTo(topFace.x + topFace.w, topFace.y);
  ctx.lineTo(topFace.x + topFace.w + flapHeight - taper, topFace.y);
  ctx.lineTo(topFace.x + topFace.w + flapHeight, topFace.y + taper);
  ctx.lineTo(topFace.x + topFace.w + flapHeight, topFace.y + topFace.h - taper);
  ctx.lineTo(topFace.x + topFace.w + flapHeight - taper, topFace.y + topFace.h);
  ctx.lineTo(topFace.x + topFace.w, topFace.y + topFace.h);
  ctx.closePath();
  ctx.fill();

  Promise.all(promises).then(() => {
    // 3) Decals (clipped per face)
    draw2DDecals(ctx, scaleFactor, layout, boxParams);

    // 4) Lines
    ctx.lineWidth = 2;

    // Fold lines (dashed)
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "#000000";
    const top = layout[2],
      back = layout[5],
      bottom = layout[3],
      front = layout[4],
      left = layout[1],
      right = layout[0];
    ctx.moveTo(top.x, top.y + top.h);
    ctx.lineTo(top.x + top.w, top.y + top.h);
    ctx.moveTo(back.x, back.y + back.h);
    ctx.lineTo(back.x + back.w, back.y + back.h);
    ctx.moveTo(bottom.x, bottom.y + bottom.h);
    ctx.lineTo(bottom.x + bottom.w, bottom.y + bottom.h);
    ctx.moveTo(left.x + left.w, left.y);
    ctx.lineTo(left.x + left.w, left.y + left.h);
    ctx.moveTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x, top.y + top.h);
    ctx.moveTo(top.x + top.w, top.y);
    ctx.lineTo(top.x + top.w, top.y + top.h);
    ctx.stroke();

    // Cut lines (also dashed for consistency)
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "#000000";
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(left.x + left.w, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(top.x + top.w, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x + right.w, right.y);
    ctx.lineTo(right.x + right.w, right.y + right.h);
    ctx.lineTo(right.x, right.y + right.h);
    ctx.lineTo(bottom.x + bottom.w, bottom.y);
    ctx.lineTo(front.x + front.w, front.y + front.h);
    ctx.lineTo(front.x, front.y + front.h);
    ctx.lineTo(bottom.x, bottom.y + bottom.h);
    ctx.lineTo(left.x + left.w, left.y + left.h);
    ctx.lineTo(left.x, left.y + left.h);
    ctx.closePath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x - flapHeight + taper, top.y);
    ctx.lineTo(top.x - flapHeight, top.y + taper);
    ctx.lineTo(top.x - flapHeight, top.y + top.h - taper);
    ctx.lineTo(top.x - flapHeight + taper, top.y + top.h);
    ctx.lineTo(top.x, top.y + top.h);
    ctx.moveTo(top.x + top.w, top.y);
    ctx.lineTo(top.x + top.w + flapHeight - taper, top.y);
    ctx.lineTo(top.x + top.w + flapHeight, top.y + taper);
    ctx.lineTo(top.x + top.w + flapHeight, top.y + top.h - taper);
    ctx.lineTo(top.x + top.w + flapHeight - taper, top.y + top.h);
    ctx.lineTo(top.x + top.w, top.y + top.h);
    ctx.stroke();

    // 5) Dimensions text
    draw2DDimensions(ctx, layout, w, h, d, flapHeight);
  });
}

function draw2DDecals(ctx, scaleFactor, layout, boxParams) {
  decals.forEach((decal) => {
    const faceLayout = layout[decal.attachedFaceMaterialIndex];
    if (!faceLayout) return;

    // Clip to face rect to prevent overflow
    ctx.save();
    ctx.beginPath();
    ctx.rect(faceLayout.x, faceLayout.y, faceLayout.w, faceLayout.h);
    ctx.clip();

    // Position relative to face center (Three.js meters -> mm)
    const decalRelativePos = decal.position.clone().sub(decal.initialPosition);
    const offsetX = decalRelativePos.dot(decal.tangent) * 1000; // mm
    const offsetY = decalRelativePos.dot(decal.bitangent) * 1000; // mm

    const cx = faceLayout.x + faceLayout.w / 2 + offsetX * scaleFactor;
    const cy = faceLayout.y + faceLayout.h / 2 - offsetY * scaleFactor; // canvas Y inverted

    const baseWmm = decal.geometry.parameters.width * 1000;
    const baseHmm = decal.geometry.parameters.height * 1000;
    const s = decal.scale.x; // uniform
    const drawW = baseWmm * s * scaleFactor;
    const drawH = baseHmm * s * scaleFactor;
    const rot = decal.rotation.z; // radians

    // Draw
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    const img = decal.material.map.image;
    if (img instanceof HTMLCanvasElement) {
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (img instanceof HTMLImageElement) {
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else if (img) {
      // fallback if texture image is something else
      try {
        const tmp = new Image();
        tmp.src = img.src || "";
        ctx.drawImage(tmp, -drawW / 2, -drawH / 2, drawW, drawH);
      } catch (_) {}
    }

    ctx.restore();
  });
}

function draw2DDimensions(ctx, layout, w, h, d, flapHeight) {
  ctx.fillStyle = "black";
  ctx.font = "bold 14px Arial";

  const topFace = layout[2];
  const backFace = layout[5];
  const leftFace = layout[1];

  // Width (w)
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${w}mm`, topFace.x + topFace.w / 2, topFace.y - 5);

  // Height (h)
  ctx.save();
  ctx.translate(leftFace.x - flapHeight - 5, backFace.y + backFace.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`${h}mm`, 0, 0);
  ctx.restore();

  // Depth (d)
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${d}mm`, leftFace.x + leftFace.w / 2, leftFace.y - 5);
}

// ---------- Movement Limits (with rotation) ----------
function updateTransformLimits() {
  const decal = getActiveDecal();
  const face = selectedFace;
  if (!decal && !face) return;

  // Eğer yüzey seçiliyse ama decal yoksa, konum alanlarını yüzey sınırlarına göre ayarla
  if (!decal && face) {
    const { faceW, faceH } = getFaceSizeForMatIndex(
      face.materialIndex,
      currentMesh.geometry.parameters
    );
    const maxX = Math.max(0, faceW / 2 - 0.001);
    const maxY = Math.max(0, faceH / 2 - 0.001);
    posXInput.min = -maxX;
    posXInput.max = maxX;
    posYInput.min = -maxY;
    posYInput.max = maxY;
    const step = Math.max(0.0005, Math.min(maxX, maxY) / 100 || 0.001);
    posXInput.step = step;
    posYInput.step = step;
    return;
  }

  // Aktif decal varsa
  const { faceW, faceH } = getFaceParamsForDecal(decal);
  const base = decal.geometry.parameters; // m
  const scaledW = base.width * decal.scale.x;
  const scaledH = base.height * decal.scale.y;

  const theta = decal.rotation.z || 0;
  const { halfX, halfY } = rotatedHalfExtents(scaledW, scaledH, theta);

  const maxX = Math.max(0, faceW / 2 - halfX);
  const maxY = Math.max(0, faceH / 2 - halfY);

  posXInput.min = -maxX;
  posXInput.max = maxX;
  posYInput.min = -maxY;
  posYInput.max = maxY;

  const step = Math.max(0.0005, Math.min(maxX, maxY) / 100 || 0.001);
  posXInput.step = step;
  posYInput.step = step;
}

function onTransformChange() {
  const decal = getActiveDecal();
  if (!decal) return;

  // Scale
  const newScale = Math.max(0.01, parseFloat(scaleInput.value) || 1);
  decal.scale.set(newScale, newScale, newScale);

  // Rotation
  const rotRad = ((parseFloat(rotationInput.value) || 0) * Math.PI) / 180;
  decal.rotation.z = rotRad;

  // Limits depend on rotation/scale
  updateTransformLimits();

  // Position (clamp)
  const { faceW, faceH } = getFaceParamsForDecal(decal);
  const base = decal.geometry.parameters;
  const scaledW = base.width * decal.scale.x;
  const scaledH = base.height * decal.scale.y;
  const { halfX, halfY } = rotatedHalfExtents(
    scaledW,
    scaledH,
    decal.rotation.z
  );

  const maxX = Math.max(0, faceW / 2 - halfX);
  const maxY = Math.max(0, faceH / 2 - halfY);

  let posX = parseFloat(posXInput.value) || 0;
  let posY = parseFloat(posYInput.value) || 0;
  posX = Math.max(-maxX, Math.min(maxX, posX));
  posY = Math.max(-maxY, Math.min(maxY, posY));
  posXInput.value = posX;
  posYInput.value = posY;

  const newPos = decal.initialPosition
    .clone()
    .add(decal.tangent.clone().multiplyScalar(posX))
    .add(decal.bitangent.clone().multiplyScalar(posY));
  decal.position.copy(newPos);
}

// ---------- Loop ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

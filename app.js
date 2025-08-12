// ---- 3D Box Customizer (full file, revised) ----
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const wrap = document.getElementById("canvas-wrap");
const skuListEl = document.getElementById("sku-list");
const metaEl = document.getElementById("meta");
const loadingEl = document.getElementById("loading");

const dimensionPanel = document.getElementById('dimension-panel');
const dimWInput = document.getElementById('dim-w');
const dimHInput = document.getElementById('dim-h');
const dimDInput = document.getElementById('dim-d');
const updateDimsBtn = document.getElementById('update-dims-btn');

const editPanel = document.getElementById("edit-panel");
const textInput = document.getElementById("text-input");
const addTextBtn = document.getElementById("add-text-btn");
const imageInput = document.getElementById("image-input");
const posXInput = document.getElementById("pos-x");
const posYInput = document.getElementById("pos-y");
const rotationInput = document.getElementById("rotation");
const scaleInput = document.getElementById('scale');
const deleteDecalBtn = document.getElementById('delete-decal-btn');
const show2dViewBtn = document.getElementById('show-2d-view-btn');
const twoDViewEl = document.getElementById('two-d-view');
const twoDCanvas = document.getElementById('two-d-canvas');
const backTo3dBtn = document.getElementById('back-to-3d-btn');

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
let decals = []; // Array to store all added decals
let selectedDecal = null; // Currently selected decal
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

function onDeleteDecal() {
  if (selectedDecal) {
    scene.remove(selectedDecal);
    selectedDecal.geometry?.dispose();
    selectedDecal.material?.dispose();

    // Remove from decals array
    const index = decals.indexOf(selectedDecal);
    if (index > -1) {
      decals.splice(index, 1);
    }

    selectedDecal = null;
    selectedFace = null; // Clear selected face as well
    editPanel.classList.add('hidden');

    // Update hasUnsavedChanges
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
  updateDimsBtn.addEventListener('click', updateDimensions);
  addTextBtn.addEventListener("click", onAddText);
  imageInput.addEventListener("change", onAddImage);
  deleteDecalBtn.addEventListener('click', onDeleteDecal);
  show2dViewBtn.addEventListener('click', show2DView);
  backTo3dBtn.addEventListener('click', hide2DView);
  posXInput.addEventListener("input", onTransformChange);
  posYInput.addEventListener("input", onTransformChange);
  rotationInput.addEventListener("input", onTransformChange);
  scaleInput.addEventListener("input", onTransformChange);

  // UI + first load
  items = cfg.items || [];
  buildSidebar(items);
  if (items.length) selectSKU(items[0].sku);

  hide2DView(); // Ensure 3D view is active initially
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
      <img src="${item.thumb || item.faces?.front || item.faces?.single || ""}" alt="">
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

  // Önce mevcut durumu temizle
  clearDecals();

  // Yeni koli modelini yükle
  showLoading(true);
  await loadItem(item).catch(console.error);
  showLoading(false);

  // Her şey yüklendikten sonra, boyutları ilgili alanlara doldur ve paneli göster
  dimWInput.value = item.dims.w;
  dimHInput.value = item.dims.h;
  dimDInput.value = item.dims.d;
  dimensionPanel.classList.remove('hidden');
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

  const currentItem = items.find(i => i.sku === selectedSKU);
  const modifiedItem = {
    ...currentItem,
    dims: { w, h, d },
  };

  metaEl.textContent = `${modifiedItem.name || modifiedItem.sku} — ${fmtDims(modifiedItem.dims)}`;

  // Yeni boyutlarla modeli yeniden yükle
  clearDecals();
  showLoading(true);
  loadItem(modifiedItem)
    .catch(console.error)
    .finally(() => {
      showLoading(false);
      // Güncellemeden sonra paneli tekrar göster
      dimensionPanel.classList.remove('hidden');
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
  decals = []; // Clear the decals array
  selectedDecal = null; // Reset selected decal
  lastDecal = null;
  hasUnsavedChanges = false;
  selectedFace = null;

  dimensionPanel.classList.add('hidden');
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

  // Check for decal intersection first
  const decalIntersects = raycaster.intersectObjects(decals);

  if (decalIntersects.length > 0) {
    // Decal clicked
    const clickedDecal = decalIntersects[0].object;
    if (selectedDecal !== clickedDecal) {
      // Deselect previous decal if any
      if (selectedDecal) {
        selectedDecal.material.color.set(0xffffff); // Reset color
      }
      selectedDecal = clickedDecal;
      selectedDecal.material.color.set(0x00ff00); // Highlight selected decal
      selectedFace = null; // Clear selected face
      // Update edit panel with decal's current transform values
      posXInput.value = selectedDecal.position.clone().sub(selectedDecal.initialPosition).dot(selectedDecal.tangent);
      posYInput.value = selectedDecal.position.clone().sub(selectedDecal.initialPosition).dot(selectedDecal.bitangent);
      rotationInput.value = (selectedDecal.rotation.z * 180 / Math.PI).toFixed(2);
      scaleInput.value = selectedDecal.scale.x.toFixed(2);
      editPanel.classList.remove('hidden');
    }
  } else if (currentMesh) {
    // Check for box face intersection
    const boxIntersects = raycaster.intersectObject(currentMesh);
    if (boxIntersects.length > 0) {
      // Box face clicked
      if (selectedDecal) {
        selectedDecal.material.color.set(0xffffff); // Reset color
        selectedDecal = null; // Clear selected decal
      }
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
        point: boxIntersects[0].point, // sadece bilgi
        center: centerWorld, // anchor: yüzey merkezi
        tangent,
        bitangent,
      };

      editPanel.classList.remove("hidden");

      const distance = 0.8;
      const targetPosition = selectedFace.center
        .clone()
        .add(normal.clone().multiplyScalar(distance));
      const targetLookAt = selectedFace.center.clone();
      animateCameraTo(targetPosition, targetLookAt);
    } else {
      // Clicked nothing
      if (selectedDecal) {
        selectedDecal.material.color.set(0xffffff); // Reset color
      }
      selectedDecal = null;
      selectedFace = null;
      editPanel.classList.add("hidden");
    }
  } else {
    // Clicked nothing and no current mesh
    if (selectedDecal) {
      selectedDecal.material.color.set(0xffffff); // Reset color
    }
    selectedDecal = null;
    selectedFace = null;
    editPanel.classList.add("hidden");
  }
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

  // 0 right(+X),1 left(-X)   -> u: Z (depth), v: Y (height)
  // 2 top(+Y), 3 bottom(-Y)  -> u: X (width), v: Z (depth)
  // 4 front(+Z),5 back(-Z)   -> u: X (width), v: Y (height)
  switch (materialIndex) {
    case 0:
      centerLocal = new THREE.Vector3(+hw, 0, 0);
      tangentLocal = new THREE.Vector3(0, 0, 1);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 1:
      centerLocal = new THREE.Vector3(-hw, 0, 0);
      tangentLocal = new THREE.Vector3(0, 0, 1);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 2:
      centerLocal = new THREE.Vector3(0, +hh, 0);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 0, 1);
      break;
    case 3:
      centerLocal = new THREE.Vector3(0, -hh, 0);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 0, 1);
      break;
    case 4:
      centerLocal = new THREE.Vector3(0, 0, +hd);
      tangentLocal = new THREE.Vector3(1, 0, 0);
      bitangentLocal = new THREE.Vector3(0, 1, 0);
      break;
    case 5:
      centerLocal = new THREE.Vector3(0, 0, -hd);
      tangentLocal = new THREE.Vector3(1, 0, 0);
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
    // right/left
    return { faceW: boxParams.depth, faceH: boxParams.height };
  } else if (matIndex === 2 || matIndex === 3) {
    // top/bottom
    return { faceW: boxParams.width, faceH: boxParams.depth };
  } else {
    // front/back
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
  const canvasSize = 512; // daha keskin yazı
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  context.fillStyle = "rgba(0,0,0,0)";
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.fillStyle = "black";
  context.font = "bold 96px Arial";
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

  const decalSize = 0.2; // metre (kutunun metre cinsinden boyutlarına göre)
  const geo = new THREE.PlaneGeometry(decalSize, decalSize);
  const decal = new THREE.Mesh(geo, mat);

  // anchor ve yön
  decal.position.copy(selectedFace.center);
  decal.lookAt(selectedFace.center.clone().add(selectedFace.faceNormal));
  decal.initialPosition = selectedFace.center.clone();
  decal.tangent = selectedFace.tangent.clone();
  decal.bitangent = selectedFace.bitangent.clone();
  decal.attachedFaceMaterialIndex = selectedFace.materialIndex; // Store face info

  scene.add(decal);
  decals.push(decal); // Add decal to the array
  lastDecal = decal;
  hasUnsavedChanges = true;

  updateTransformLimits();
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

    const decalSize = 0.2;
    const aspect = texture.image.width / texture.image.height || 1;
    const geo = new THREE.PlaneGeometry(decalSize, decalSize / aspect);
    const decal = new THREE.Mesh(geo, mat);

    decal.position.copy(selectedFace.center);
    decal.lookAt(selectedFace.center.clone().add(selectedFace.faceNormal));
    decal.initialPosition = selectedFace.center.clone();
    decal.tangent = selectedFace.tangent.clone();
    decal.bitangent = selectedFace.bitangent.clone();
    decal.attachedFaceMaterialIndex = selectedFace.materialIndex; // Store face info

    scene.add(decal);
    decals.push(decal); // Add decal to the array
    lastDecal = decal;
    hasUnsavedChanges = true;

    updateTransformLimits();
  });
}



function show2DView() {
  // Hide 3D canvas
  wrap.classList.add('hidden');
  // Show 2D canvas
  twoDViewEl.classList.remove('hidden');
  // TODO: Implement 2D rendering logic here
  draw2DBox();
}

function hide2DView() {
  // Show 3D canvas
  wrap.classList.remove('hidden');
  // Hide 2D canvas
  twoDViewEl.classList.add('hidden');
}

function draw2DBox() {
  const ctx = twoDCanvas.getContext('2d');
  ctx.clearRect(0, 0, twoDCanvas.width, twoDCanvas.height);

  const boxParams = currentMesh.geometry.parameters;
  const w = boxParams.width * 1000; // Convert to mm for 2D drawing
  const h = boxParams.height * 1000;
  const d = boxParams.depth * 1000;

  // Define layout for unfolded box (cross shape)
  // Center strip: Back, Top, Front, Bottom
  // Side flaps: Left, Right (attached to Top face)

  const scaleFactor = 1; // Adjust as needed for canvas size

  const faceWidth = w * scaleFactor;
  const faceHeight = h * scaleFactor;
  const faceDepth = d * scaleFactor;

  const layout = {
    // materialIndex: { x, y, w, h }
    // Order: right, left, top, bottom, front, back
    // Assuming Back (5) is the central face in the vertical strip
    5: { x: faceDepth, y: faceDepth, w: faceWidth, h: faceHeight }, // Back
    2: { x: faceDepth, y: 0, w: faceWidth, h: faceDepth }, // Top (above Back)
    3: { x: faceDepth, y: faceDepth + faceHeight, w: faceWidth, h: faceDepth }, // Bottom (below Back)
    4: { x: faceDepth, y: faceDepth + faceHeight + faceDepth, w: faceWidth, h: faceHeight }, // Front (below Bottom)
    1: { x: 0, y: faceDepth, w: faceDepth, h: faceHeight }, // Left (left of Back)
    0: { x: faceDepth + faceWidth, y: faceDepth, w: faceDepth, h: faceHeight }, // Right (right of Back)
  };

  // Calculate total canvas dimensions based on the corrected layout
  const totalWidth = faceDepth + faceWidth + faceDepth; // Left + Back/Top/Bottom + Right
  const totalHeight = faceDepth + faceHeight + faceDepth + faceHeight; // Top + Back + Bottom + Front

  twoDCanvas.width = totalWidth;
  twoDCanvas.height = totalHeight;

  ctx.fillStyle = '#f0f0f0'; // Background for the unfolded box
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Draw faces
  const loader = new THREE.TextureLoader();
  const promises = [];

  for (let i = 0; i < currentMats.length; i++) {
    const mat = currentMats[i];
    if (mat.map) {
      const img = new Image();
      img.src = mat.map.image.src;
      const { x, y, w, h } = layout[i];
      promises.push(new Promise(resolve => {
        img.onload = () => {
          ctx.drawImage(img, x, y, w, h);
          resolve();
        };
      }));
    }
  }

  Promise.all(promises).then(() => {
    // All textures drawn, now draw decals
    draw2DDecals(ctx, scaleFactor, layout, boxParams);
  });
}

function draw2DDecals(ctx, scaleFactor, layout, boxParams) {
  decals.forEach(decal => {
    const faceLayout = layout[decal.attachedFaceMaterialIndex];
    if (!faceLayout) return; // Should not happen if face info is correctly stored

    const faceW = getFaceSizeForMatIndex(decal.attachedFaceMaterialIndex, boxParams).faceW * 1000; // mm
    const faceH = getFaceSizeForMatIndex(decal.attachedFaceMaterialIndex, boxParams).faceH * 1000; // mm

    // Decal's position relative to its face center (in meters, from initialPosition)
    const decalRelativePos = decal.position.clone().sub(decal.initialPosition);

    // Project decal's relative position onto the face's tangent and bitangent axes
    // These are the x and y offsets on the face plane
    const offsetX = decalRelativePos.dot(decal.tangent) * 1000; // Convert to mm
    const offsetY = decalRelativePos.dot(decal.bitangent) * 1000; // Convert to mm

    // Calculate decal's center on the 2D face
    // Face coordinates are from top-left corner
    const decal2DX = faceLayout.x + (faceLayout.w / 2) + offsetX * scaleFactor;
    const decal2DY = faceLayout.y + (faceLayout.h / 2) + offsetY * scaleFactor;

    // Decal's size and rotation
    const decalBaseWidth = decal.geometry.parameters.width * 1000; // mm
    const decalBaseHeight = decal.geometry.parameters.height * 1000; // mm
    const decalScale = decal.scale.x; // Assuming uniform scale
    const decalRotation = decal.rotation.z; // Z-rotation on the face

    const drawWidth = decalBaseWidth * decalScale * scaleFactor;
    const drawHeight = decalBaseHeight * decalScale * scaleFactor;

    ctx.save();
    ctx.translate(decal2DX, decal2DY);
    ctx.rotate(decalRotation);

    // Draw the decal image or canvas content
    if (decal.material.map.image instanceof HTMLCanvasElement) {
      // Text decal
      ctx.drawImage(decal.material.map.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    } else {
      // Image decal
      ctx.drawImage(decal.material.map.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }

    ctx.restore();
  });
}

// ---------- Movement Limits (with rotation) ----------
function updateTransformLimits() {
  if (!lastDecal || !selectedFace) return;

  const boxParams = currentMesh.geometry.parameters;
  const { faceW, faceH } = getFaceSizeForMatIndex(
    selectedFace.materialIndex,
    boxParams
  );

  const base = lastDecal.geometry.parameters; // width/height of plane (meters)
  const scaledW = base.width * lastDecal.scale.x;
  const scaledH = base.height * lastDecal.scale.y;

  const theta = lastDecal.rotation.z || 0;
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
  if (!lastDecal || !selectedFace) return;

  // Ölçek
  const scale = parseFloat(scaleInput.value) || 1;
  lastDecal.scale.set(scale, scale, scale);

  // Rotasyon (deg -> rad)
  const rotRad = ((parseFloat(rotationInput.value) || 0) * Math.PI) / 180;
  lastDecal.rotation.z = rotRad;

  // limitler scale/rotation’a bağlı — yeniden hesapla
  updateTransformLimits();

  // Pozisyon (clamp)
  const boxParams = currentMesh.geometry.parameters;
  const { faceW, faceH } = getFaceSizeForMatIndex(
    selectedFace.materialIndex,
    boxParams
  );

  const base = lastDecal.geometry.parameters;
  const scaledW = base.width * lastDecal.scale.x;
  const scaledH = base.height * lastDecal.scale.y;
  const { halfX, halfY } = rotatedHalfExtents(
    scaledW,
    scaledH,
    lastDecal.rotation.z
  );

  const maxX = Math.max(0, faceW / 2 - halfX);
  const maxY = Math.max(0, faceH / 2 - halfY);

  let posX = parseFloat(posXInput.value) || 0;
  let posY = parseFloat(posYInput.value) || 0;

  posX = Math.max(-maxX, Math.min(maxX, posX));
  posY = Math.max(-maxY, Math.min(maxY, posY));

  posXInput.value = posX;
  posYInput.value = posY;

  const newPos = selectedFace.center
    .clone()
    .add(selectedFace.tangent.clone().multiplyScalar(posX))
    .add(selectedFace.bitangent.clone().multiplyScalar(posY));

  lastDecal.position.copy(newPos);
}

// ---------- Loop ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
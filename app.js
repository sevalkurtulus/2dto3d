// ---- 3D Box Customizer (full file, revised) ----
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const wrap = document.getElementById("canvas-wrap");
const skuListEl = document.getElementById("sku-list");
const metaEl = document.getElementById("meta");
const loadingEl = document.getElementById("loading");
const editPanel = document.getElementById("edit-panel");
const textInput = document.getElementById("text-input");
const addTextBtn = document.getElementById("add-text-btn");
const imageInput = document.getElementById("image-input");
const posXInput = document.getElementById("pos-x");
const posYInput = document.getElementById("pos-y");
const rotationInput = document.getElementById("rotation");
const scaleInput = document.getElementById('scale');
const deleteDecalBtn = document.getElementById('delete-decal-btn');

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
  ],
};

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
  addTextBtn.addEventListener("click", onAddText);
  imageInput.addEventListener("change", onAddImage);
  deleteDecalBtn.addEventListener('click', onDeleteDecal);
  posXInput.addEventListener("input", onTransformChange);
  posYInput.addEventListener("input", onTransformChange);
  rotationInput.addEventListener("input", onTransformChange);
  scaleInput.addEventListener("input", onTransformChange);

  // UI + first load
  items = cfg.items || [];
  buildSidebar(items);
  if (items.length) selectSKU(items[0].sku);

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

    scene.add(decal);
    decals.push(decal); // Add decal to the array
    lastDecal = decal;
    hasUnsavedChanges = true;

    updateTransformLimits();
  });
}

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

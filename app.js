import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const wrap = document.getElementById("canvas-wrap");
const skuListEl = document.getElementById("sku-list");
const metaEl = document.getElementById("meta");
const loadingEl = document.getElementById("loading");
const editPanel = document.getElementById('edit-panel');
const textInput = document.getElementById('text-input');
const addTextBtn = document.getElementById('add-text-btn');
const imageInput = document.getElementById('image-input');
const posXInput = document.getElementById('pos-x');
const posYInput = document.getElementById('pos-y');
const rotationInput = document.getElementById('rotation');
const scaleInput = document.getElementById('scale');

let renderer,
  scene,
  camera,
  controls,
  currentMesh,
  currentMats = [],
  raycaster,
  mouse;
const cfg = {
  "items": [
    {
      "sku": "SKU123",
      "name": "Kraft Koli - Orta",
      "dims": { "w": 300, "h": 200, "d": 220 },
      "faces": {
        "front": "assets/boxes/SKU123/front.jpg",
        "back": "assets/boxes/SKU123/back.jpg",
        "left": "assets/boxes/SKU123/left.jpg",
        "right": "assets/boxes/SKU123/right.jpg",
        "top": "assets/boxes/SKU123/top.jpg",
        "bottom": "assets/boxes/SKU123/bottom.jpg"
      },
      "thumb": "assets/boxes/SKU123/front.jpg"
    },
    {
      "sku": "SKU124",
      "name": "Beyaz Koli - Küçük (Tek görsel)",
      "dims": { "w": 220, "h": 160, "d": 180 },
      "faces": { "single": "assets/boxes/SKU124/single.jpg" },
      "thumb": "assets/boxes/SKU124/single.jpg"
    }
  ]
};

let items = [];
let selectedSKU = null;
let selectedFace = null;
let lastDecal = null;
let hasUnsavedChanges = false;
let isAnimating = false;
let animationStartTime = 0;
const animationDuration = 500; // ms

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

  // Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Events
  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("click", onCanvasClick, false);
  addTextBtn.addEventListener('click', onAddText);
  imageInput.addEventListener('change', onAddImage);

  posXInput.addEventListener('input', onTransformChange);
  posYInput.addEventListener('input', onTransformChange);
  rotationInput.addEventListener('input', onTransformChange);
  scaleInput.addEventListener('input', onTransformChange);

  // Load config & UI
  items = cfg.items || [];
  buildSidebar(items);

  // Auto-select first
  if (items.length) selectSKU(items[0].sku);

  animate();
}

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

async function selectSKU(sku) {
  const item = items.find((i) => i.sku === sku);
  if (!item) return;

  if (hasUnsavedChanges) {
    const confirmSwitch = confirm("Mevcut koli üzerindeki değişiklikler kaydedilmeyecektir. Yeni koliye geçmek istediğinize emin misiniz?");
    if (!confirmSwitch) {
      return; // User cancelled the switch
    }
  }

  selectedSKU = sku;
  setActive(sku);
  metaEl.textContent = `${item.name || item.sku} — ${fmtDims(item.dims)}`;

  clearDecals(); // Clear existing decals and reset UI
  showLoading(true);
  await loadItem(item).catch(console.error);
  showLoading(false);
}

function clearDecals() {
  // Remove all decals from the scene
  const decalsToRemove = [];
  scene.children.forEach(child => {
    // Assuming decals are THREE.Mesh objects and not part of the main box mesh
    // A more robust check might involve a specific property or naming convention
    if (child instanceof THREE.Mesh && child !== currentMesh) {
      decalsToRemove.push(child);
    }
  });

  decalsToRemove.forEach(decal => {
    scene.remove(decal);
    decal.geometry?.dispose();
    decal.material?.dispose();
  });

  lastDecal = null;
  hasUnsavedChanges = false;
  selectedFace = null;
  editPanel.classList.add('hidden');
  textInput.value = '';
  imageInput.value = ''; // Clear file input
  posXInput.value = '0';
  posYInput.value = '0';
  rotationInput.value = '0';
  scaleInput.value = '1';
}

function showLoading(on) {
  loadingEl.classList.toggle("hidden", !on);
}

function fmtDims(d) {
  if (!d) return "";
  return `${d.w}×${d.h}×${d.d} mm`;
}

async function loadItem(item) {
  // Clear previous
  disposeCurrent();

  // Geo: mm → m
  const w = (item.dims?.w || 200) / 1000;
  const h = (item.dims?.h || 200) / 1000;
  const d = (item.dims?.d || 200) / 1000;

  const geo = new THREE.BoxGeometry(w, h, d);

  // Textures
  const loader = new THREE.TextureLoader();
  const faces = normalizeFaces(item.faces);

  // order: right, left, top, bottom, front, back
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
      // cardboard fallback
      return new THREE.MeshStandardMaterial({
        color: 0xb49766,
        metalness: 0,
        roughness: 0.95,
      });
    })
  );

  currentMesh = new THREE.Mesh(geo, currentMats);
  scene.add(currentMesh);

  // frame
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
  return new Promise((res, rej) => {
    loader.load(
      url,
      (t) => res(t),
      undefined,
      (err) => rej(err)
    );
  });
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

function onResize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function onCanvasClick(event) {
  if (isAnimating) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  if (!currentMesh) return;

  const intersects = raycaster.intersectObject(currentMesh);

  if (intersects.length > 0) {
    const faceIndex = intersects[0].faceIndex;
    selectedFace = {
      mesh: currentMesh,
      materialIndex: Math.floor(faceIndex / 2),
      faceNormal: intersects[0].face.normal,
      point: intersects[0].point,
    };
    editPanel.classList.remove('hidden');

    const distance = 0.8; // Adjust as needed
    const targetPosition = selectedFace.point.clone().add(selectedFace.faceNormal.clone().multiplyScalar(distance));
    const targetLookAt = selectedFace.point.clone();
    animateCameraTo(targetPosition, targetLookAt);

  } else {
    selectedFace = null;
    editPanel.classList.add('hidden');
  }
}

function animateCameraTo(targetPosition, targetLookAt) {
  isAnimating = true;
  controls.enabled = false;
  animationStartTime = Date.now();

  const startPosition = camera.position.clone();
  const startLookAt = controls.target.clone();

  function animate() {
    if (!isAnimating) return;

    const now = Date.now();
    const elapsed = now - animationStartTime;
    const t = Math.min(1, elapsed / animationDuration);

    camera.position.lerpVectors(startPosition, targetPosition, t);
    controls.target.lerpVectors(startLookAt, targetLookAt, t);
    controls.update();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      isAnimating = false;
      controls.enabled = true;
    }
  }
  animate();
}

function onAddText() {
  if (!selectedFace) return;

  const text = textInput.value;
  if (!text) return;

  addTextDecal(text);
}

function addTextDecal(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const canvasSize = 256; // Power of 2 for texture
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  context.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent background
  context.fillRect(0, 0, canvasSize, canvasSize);

  context.fillStyle = 'black';
  context.font = '48px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvasSize / 2, canvasSize / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const decalMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4, // To prevent z-fighting
  });

  const decalSize = 0.2; // Size of the decal plane
  const decalGeometry = new THREE.PlaneGeometry(decalSize, decalSize);
  const decal = new THREE.Mesh(decalGeometry, decalMaterial);

  decal.position.copy(selectedFace.point);
  decal.lookAt(selectedFace.point.clone().add(selectedFace.faceNormal));

  decal.initialPosition = decal.position.clone();
  const normal = selectedFace.faceNormal.clone();
  const tangent = new THREE.Vector3();
  tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0));
  if (tangent.lengthSq() < 0.001) {
    tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0));
  }
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  decal.tangent = tangent;
  decal.bitangent = bitangent;

  scene.add(decal);
  lastDecal = decal;
  hasUnsavedChanges = true;
  updateTransformLimits();
}

function onAddImage(event) {
  if (!selectedFace) return;

  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    addImageDecal(e.target.result);
  };
  reader.readAsDataURL(file);
}

function addImageDecal(imageData) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imageData, (texture) => {
    const decalMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    const decalSize = 0.2;
    const aspect = texture.image.width / texture.image.height;
    const decalGeometry = new THREE.PlaneGeometry(decalSize, decalSize / aspect);
    const decal = new THREE.Mesh(decalGeometry, decalMaterial);

    decal.position.copy(selectedFace.point);
    decal.lookAt(selectedFace.point.clone().add(selectedFace.faceNormal));

    decal.initialPosition = decal.position.clone();
    const normal = selectedFace.faceNormal.clone();
    const tangent = new THREE.Vector3();
    tangent.crossVectors(normal, new THREE.Vector3(0, 1, 0));
    if (tangent.lengthSq() < 0.001) {
      tangent.crossVectors(normal, new THREE.Vector3(1, 0, 0));
    }
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    decal.tangent = tangent;
    decal.bitangent = bitangent;

    scene.add(decal);
    lastDecal = decal;
    hasUnsavedChanges = true;
    updateTransformLimits();
  });
}

function updateTransformLimits() {
  if (!lastDecal || !selectedFace) return;

  const boxParams = currentMesh.geometry.parameters;
  const decalParams = lastDecal.geometry.parameters;

  let faceWidth, faceHeight;
  const matIndex = selectedFace.materialIndex;

  if (matIndex === 0 || matIndex === 1) { // right, left
    faceWidth = boxParams.depth;
    faceHeight = boxParams.height;
  } else if (matIndex === 2 || matIndex === 3) { // top, bottom
    faceWidth = boxParams.width;
    faceHeight = boxParams.depth;
  } else { // front, back
    faceWidth = boxParams.width;
    faceHeight = boxParams.height;
  }

  const decalWidth = decalParams.width * lastDecal.scale.x;
  const decalHeight = decalParams.height * lastDecal.scale.y;

  const maxX = (faceWidth - decalWidth) / 2;
  const maxY = (faceHeight - decalHeight) / 2;

  posXInput.min = -maxX;
  posXInput.max = maxX;
  posYInput.min = -maxY;
  posYInput.max = maxY;

  // Set step to a reasonable value
  const step = Math.min(maxX, maxY) / 100;
  posXInput.step = step;
  posYInput.step = step;
}

function onTransformChange() {
  if (!lastDecal || !selectedFace) return;

  // Update scale first, as it affects position limits
  const scale = parseFloat(scaleInput.value);
  lastDecal.scale.set(scale, scale, scale);

  // Update position limits
  updateTransformLimits();

  const boxParams = currentMesh.geometry.parameters;
  const decalParams = lastDecal.geometry.parameters;

  let faceWidth, faceHeight;
  const matIndex = selectedFace.materialIndex;

  if (matIndex === 0 || matIndex === 1) { // right, left
    faceWidth = boxParams.depth;
    faceHeight = boxParams.height;
  } else if (matIndex === 2 || matIndex === 3) { // top, bottom
    faceWidth = boxParams.width;
    faceHeight = boxParams.depth;
  } else { // front, back
    faceWidth = boxParams.width;
    faceHeight = boxParams.height;
  }

  const decalWidth = decalParams.width * lastDecal.scale.x;
  const decalHeight = decalParams.height * lastDecal.scale.y;

  const maxX = (faceWidth - decalWidth) / 2;
  const maxY = (faceHeight - decalHeight) / 2;

  let posX = parseFloat(posXInput.value);
  let posY = parseFloat(posYInput.value);

  posX = Math.max(-maxX, Math.min(maxX, posX));
  posY = Math.max(-maxY, Math.min(maxY, posY));

  posXInput.value = posX;
  posYInput.value = posY;

  const newPosition = lastDecal.initialPosition.clone()
    .add(lastDecal.tangent.clone().multiplyScalar(posX))
    .add(lastDecal.bitangent.clone().multiplyScalar(posY));
  lastDecal.position.copy(newPosition);

  // Rotation
  const rotation = parseFloat(rotationInput.value) * (Math.PI / 180);
  lastDecal.rotation.z = rotation;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

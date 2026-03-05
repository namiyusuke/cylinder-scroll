import * as THREE from 'three';
import './style.css';

// ============================================================
// CONFIG
// ============================================================
const CFG = {
  radius: 5.5,
  arcAngle: Math.PI * 0.25,
  cardHeight: 3.0,
  cardGap: 1.6,
  segmentsX: 48,
  segmentsY: 20,
  scrollSpeed: 0.005,
  scrollLerp: 0.065,
  rotationFactor: 0.012,
  cameraFov: 50,
  parallaxMin: 1.0,
  parallaxMax: 1.0,
  bendStrength: 0.55,       // シェーダー曲げ強度（大きい=より奥に引き込む）
  bendTransition: 3.,      // この距離あたりからY移動→Z移動に遷移
};

// ============================================================
// PROJECTS — dummy01〜03を順番に割り当て
// ============================================================
const projects = [
  { title: '',  category: '', date: '', image: '/dummy01.png' },
  { title: '',  category: '',   date: '',   image: '/dummy02.png' },
  { title: '',  category: '',   date: '', image: '/dummy03.png' },
  { title: '',   category: '',      date: '', image: '/dummy01.png' },
];

const totalCards = projects.length;
const cardStep = CFG.cardHeight + CFG.cardGap;
const totalLoopHeight = totalCards * cardStep;

// ============================================================
// TextureLoader でダミー画像を読み込み
// ============================================================
const textureLoader = new THREE.TextureLoader();

function loadCardTexture(imagePath) {
  const tex = textureLoader.load(imagePath);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================
// Plane card geometry
// ============================================================
const cardWidth = 2 * CFG.radius * Math.sin(CFG.arcAngle / 2); // 元の弧の横幅に合わせる
const sharedGeo = new THREE.PlaneGeometry(
  cardWidth,
  CFG.cardHeight,
  CFG.segmentsX,
  CFG.segmentsY,
);

// ============================================================
// SCENE
// ============================================================
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(CFG.cameraFov, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0a0e14, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
const pointLight = new THREE.PointLight(0xffffff, 1.5, 30);
pointLight.position.set(0, 0, 0);
scene.add(pointLight);

// ============================================================
// CARDS
// ============================================================
const cardGroup = new THREE.Group();
scene.add(cardGroup);
const cards = [];

const COPIES = 3;
for (let copy = 0; copy < COPIES; copy++) {
  for (let i = 0; i < totalCards; i++) {
    const proj = projects[i];
    const tex = loadCardTexture(proj.image);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.05,
      transparent: true,
      opacity: 1,
    });

    // ---- shader injection: uDepth で頂点をZ方向に押し込む ----
    mat.userData.uniforms = {
      uDepth:  { value: 0.0 },
      uHalfH:  { value: CFG.cardHeight / 2 },
    };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDepth  = mat.userData.uniforms.uDepth;
      shader.uniforms.uHalfH  = mat.userData.uniforms.uHalfH;

      // uniform 宣言を追加
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform float uDepth;
        uniform float uHalfH;
        `
      );

      // 頂点変位: カード内のY位置に応じてZを押し込む
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        float ny = clamp(transformed.y / uHalfH, -1., 1.); // -.7 (下端) ~ +.7 (上端)
        float tilt  = uDepth * ny;                    // 線形: 方向性のある傾き
        float curve = abs(uDepth) * ny * ny * 0.5;    // 二次: 凹面的な湾曲
        transformed.z -= (tilt + curve);
        `
      );
    };

    const mesh = new THREE.Mesh(sharedGeo, mat);

    const baseY = i * cardStep + copy * totalLoopHeight;
    mesh.position.y = baseY;

    mesh.userData = {
      baseY,
      parallaxFactor: CFG.parallaxMin + Math.random() * (CFG.parallaxMax - CFG.parallaxMin),
      project: proj,
    };

    cardGroup.add(mesh);
    cards.push(mesh);
  }
}

// ============================================================
// SCROLL STATE
// ============================================================
let scrollTarget = 0;
let scrollCurrent = 0;
let scrollVelocity = 0;

window.addEventListener('wheel', (e) => {
  scrollTarget -= e.deltaY * CFG.scrollSpeed;
}, { passive: true });

let touchPrev = 0;
window.addEventListener('touchstart', (e) => { touchPrev = e.touches[0].clientY; });
window.addEventListener('touchmove', (e) => {
  const y = e.touches[0].clientY;
  scrollTarget -= (touchPrev - y) * CFG.scrollSpeed * 2.5;
  touchPrev = y;
});

// ============================================================
// CURSOR
// ============================================================
const cursorEl = document.querySelector('.cursor');
let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
let cursorX = mouseX, cursorY = mouseY;
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

// ============================================================
// RAYCASTER
// ============================================================
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

let hoveredCard = null;

// ============================================================
// HELPERS
// ============================================================
function lerp(a, b, t) { return a + (b - a) * t; }
function mod(n, m) { return ((n % m) + m) % m; }

// ============================================================
// RENDER LOOP
// ============================================================
function animate() {
  requestAnimationFrame(animate);

  const prev = scrollCurrent;
  scrollCurrent = lerp(scrollCurrent, scrollTarget, CFG.scrollLerp);
  scrollVelocity = scrollCurrent - prev;

  // Update cards
  const loopTotal = totalLoopHeight * COPIES;
  const halfLoop = totalLoopHeight * 1.5;

  cards.forEach(card => {
    let y = card.userData.baseY - scrollCurrent * card.userData.parallaxFactor;
    y = mod(y + halfLoop, loopTotal) - halfLoop;

    // Fade by distance (logical y — before bend transformation)
    const dist = Math.abs(y);
    const fadeStart = 3;
    const fadeEnd = 10;
    card.material.opacity = dist < fadeStart ? 1 : Math.max(0, 1 - (dist - fadeStart) / (fadeEnd - fadeStart));

    // Inner-image parallax: shift texture UV based on card's screen position
    const parallaxStrength = 0.06;
    const normalizedY = y / (totalLoopHeight * 0.5);
    card.material.map.offset.y = 0.075 + normalizedY * parallaxStrength;

    // Y→Z遷移: tanhでYを頭打ちにし、余った分をZ(奥)に流す
    const tY = CFG.bendTransition;
    const absY = Math.abs(y);
    const sY = Math.sign(y) || 1;
    const cappedY = tY * Math.tanh(y / tY);
    const zDepth = absY - Math.abs(cappedY);

    // blend: 0(中心)→1(完全に遷移済み)
    const blend = Math.tanh(absY / tY);

    card.position.y = cappedY;
    card.position.z = -CFG.radius - zDepth;

    // 回転: 0→π/2 で面がZ軸に平行になる
    card.rotation.x = -sY * (Math.PI / 2) * blend * blend + scrollVelocity * 0.35;

    // シェーダー曲げ: 遷移中だけピーク、曲がり切ったら平面に戻る
    const bendPhase = Math.sin(blend * Math.PI);
    card.material.userData.uniforms.uDepth.value = sY * bendPhase * CFG.bendStrength * 2;
  });

  // Camera sway
  const mx = mouseX / window.innerWidth - 0.5;
  const my = mouseY / window.innerHeight - 0.5;
  camera.rotation.y = lerp(camera.rotation.y, -mx * 0.08, 0.04);
  camera.rotation.x = lerp(camera.rotation.x, -my * 0.04, 0.04);

  // Cursor
  cursorX = lerp(cursorX, mouseX, 0.12);
  cursorY = lerp(cursorY, mouseY, 0.12);
  cursorEl.style.left = cursorX + 'px';
  cursorEl.style.top = cursorY + 'px';

  // Hover
  mouseNDC.x = (mouseX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(mouseY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObjects(cards);

  if (hits.length > 0) {
    const card = hits[0].object;
    if (card !== hoveredCard) {
      hoveredCard = card;
      cursorEl.classList.add('hovering');
    }
    const sp = new THREE.Vector3(0, card.position.y, -CFG.radius).project(camera);
    const sy = (-sp.y * 0.5 + 0.5) * window.innerHeight;
  } else if (hoveredCard) {
    hoveredCard = null;
    cursorEl.classList.remove('hovering');
  }

  pointLight.position.y = -scrollCurrent * 0.15;
  renderer.render(scene, camera);
}

animate();

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

import * as THREE from 'three';
import './style.css';

// ============================================================
// CONFIG
// ============================================================
const CFG = {
  radius: 5.5,
  arcAngle: Math.PI * 0.25,
  cardHeight: 3.0,
  cardGap: 1.,
  segmentsX: 300,
  segmentsY: 300,
  scrollSpeed: 0.005,
  scrollLerp: 0.065,
  rotationFactor: 0.012,
  cameraFov: 50,
  parallaxMin: 1.0,
  parallaxMax: 1.0,
  bendStart: 2.0,           // Y方向この距離からベンド開始
  bendRadius: 1.0,          // 四分円ベンドの半径
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
const bendArcLength = (Math.PI / 2) * CFG.bendRadius;

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
camera.position.set(0, 0, 1);

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
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map:         { value: tex },
        uOpacity:    { value: 1.0 },
        uUvOffset:   { value: new THREE.Vector2(0, 0) },
        uCardY:      { value: 0.0 },
        uBendStart:  { value: CFG.bendStart },
        uBendRadius: { value: CFG.bendRadius },
        uBendArc: { value: bendArcLength },
        uTime:    { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uCardY;
        uniform float uBendStart;
        uniform float uBendRadius;
        uniform float uBendArc;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        varying float vElevation;
        void main() {
          vUv = uv;
          // --- 四分円弧ベンド ---
          vec3 pos = position;
          float ly  = uCardY + pos.y;
          float aly = abs(ly);
          float sly = ly >= 0.0 ? 1.0 : -1.0;
          float bY, bZ;
          if (aly <= uBendStart) {
            bY = ly;
            bZ = 0.0;
          } else if (aly <= uBendStart + uBendArc) {
            float a = (aly - uBendStart) / uBendRadius;
            bY = sly * (uBendStart + uBendRadius * sin(a));
            bZ = -uBendRadius * (1.0 - cos(a));
          } else {
            float ex = aly - uBendStart - uBendArc;
            bY = sly * (uBendStart + uBendRadius);
            bZ = -uBendRadius - ex;
          }
          pos.y += bY - ly;
          pos.z += bZ;

          // --- 法線を円弧の接線に合わせて回転 ---
          vec3 n = normal;
          float bendAngle = 0.0;
          if (aly > uBendStart) {
            bendAngle = aly <= uBendStart + uBendArc
              ? (aly - uBendStart) / uBendRadius
              : 3.14159265 / 2.0;
          }
          float ba = -sly * bendAngle;
          float c = cos(ba), s = sin(ba);
          n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);

          vNormal = normalize(normalMatrix * n);
          vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
          float elevation = sin(modelPosition.x * 1. + uTime * 2.) * 0.2;
          elevation += sin(modelPosition.y * 1. + uTime * 2.) * 0.2;
          modelPosition.z += elevation;
          vElevation = elevation;
          vec4 mvPos =  viewMatrix * modelPosition;
          vViewPos = mvPos.xyz;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        uniform float uOpacity;
        uniform vec2 uUvOffset;
        varying float vElevation;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;

        void main() {
          // テクスチャサンプリング（UVオフセット付き）
          vec2 uv = vUv + uUvOffset;
          vec4 texColor = texture2D(map, uv);

          // sRGB → リニア変換
          texColor.rgb = pow(texColor.rgb, vec3(2.2));
          // 簡易ライティング（ambient + diffuse）
          vec3 lightDir = normalize(vec3(0.0, 0.0, 1.0));
          vec3 norm = normalize(vNormal);
          float diff = max(dot(norm, lightDir), 0.0);
          float ambient = 0.6;
          float light = ambient + (1.0 - ambient) * diff;
          vec3 color = texColor.rgb * light * max(1.0, 1.0 + vElevation * 2.0);
          // リニア → sRGB 変換
          color = pow(color, vec3(1.0 / 2.2));
          gl_FragColor = vec4(color, texColor.a * uOpacity);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
    });
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
  const elapsedTime = performance.now() * 0.001;
  const prev = scrollCurrent;
  scrollCurrent = lerp(scrollCurrent, scrollTarget, CFG.scrollLerp);
  scrollVelocity = scrollCurrent - prev;
  // Update cards
  const loopTotal = totalLoopHeight * COPIES;
  const halfLoop = totalLoopHeight * 1.5;
  cards.forEach(card => {
    card.material.uniforms.uTime.value = elapsedTime;
    let y = card.userData.baseY - scrollCurrent * card.userData.parallaxFactor;
    y = mod(y + halfLoop, loopTotal) - halfLoop;

    // Fade by distance
    const dist = Math.abs(y);
    const fadeStart = 3;
    const fadeEnd = 10;
    card.material.uniforms.uOpacity.value = dist < fadeStart ? 1 : Math.max(0, 1 - (dist - fadeStart) / (fadeEnd - fadeStart));

    // Inner-image parallax
    const parallaxStrength = 0.06;
    const normalizedY = y / (totalLoopHeight * 0.5);
    card.material.uniforms.uUvOffset.value.set(0, 0.075 + normalizedY * parallaxStrength);

    // uniform 更新
    card.position.y = y;
    card.position.z = -CFG.radius;
    card.rotation.x = scrollVelocity * 0.35;
    card.material.uniforms.uCardY.value = y;
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

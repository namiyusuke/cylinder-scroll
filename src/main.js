import * as THREE from 'three';
import './style.css';
import GUI from 'lil-gui'

export default function initThreeScene() {
  // ============================================================
// CONFIG
// ============================================================
const CFG = {
  radius: 5.5,
  arcAngle: 2 * Math.asin((5.0 * (540 / 400)) / (2 * 5.5)), // cardHeight * aspect / (2 * radius)
  cardHeight: 5.0,
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
  { title: 'about',  category: '', date: '', image: '/dummy02.webp' ,link:"/about.html"},
  { title: 'about',  category: '',   date: '',   image: '/dummy02.webp',link:"/about2/" },
  { title: 'about',  category: '',   date: '', image: '/dummy02.webp',link:"/about3/" },
];
const gui = new GUI()
const totalCards = projects.length;
const cardStep = CFG.cardHeight + CFG.cardGap;
const totalLoopHeight = totalCards * cardStep;
const bendArcLength = (Math.PI / 2) * CFG.bendRadius;

// ============================================================
// TextureLoader でダミー画像を読み込み
// ============================================================
const textureLoader = new THREE.TextureLoader();

function loadCardTexture(imagePath) {
  const isVideo = /\.(mp4|webm|ogg)$/i.test(imagePath);
  if (isVideo) {
    const video = document.createElement('video');
    video.src = imagePath;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play();
    const tex = new THREE.VideoTexture(video);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
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

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ============================================================
// BACKGROUND — Simplex noise gradient shader
// ============================================================
const bgScene  = new THREE.Scene();
const bgCamera = new THREE.Camera();

const bgFragmentShader = /* glsl */`
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_speed;
  uniform float u_scale;
  uniform float u_softness;
  uniform vec2  u_resolution;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4  j  = p - 49.0 * floor(p * ns.z * ns.z);
    vec4  x_ = floor(j * ns.z);
    vec4  y_ = floor(j - 7.0 * x_);
    vec4  x  = x_ * ns.x + ns.yyyy;
    vec4  y  = y_ * ns.x + ns.yyyy;
    vec4  h  = 1.0 - abs(x) - abs(y);
    vec4  b0 = vec4(x.xy, y.xy);
    vec4  b1 = vec4(x.zw, y.zw);
    vec4  s0 = floor(b0) * 2.0 + 1.0;
    vec4  s1 = floor(b1) * 2.0 + 1.0;
    vec4  sh = -step(h, vec4(0.0));
    vec4  a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4  a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3  p0 = vec3(a0.xy, h.x);
    vec3  p1 = vec3(a0.zw, h.y);
    vec3  p2 = vec3(a1.xy, h.z);
    vec3  p3 = vec3(a1.zw, h.w);
    vec4  norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4  m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uv = v_uv;
    uv.x *= aspect;
    float t = u_time * u_speed;
    vec2 st = uv * u_scale;
    float n1 = snoise(vec3(st,t));
    float n2 = snoise(vec3(st * 0.8 + vec2(17.1, 31.7), t * 0.7));
    float n3 = snoise(vec3(st * 0.6 + vec2(53.4, 89.2), t * 0.5));
    float n = (n1 * 0.45 + n2 * 0.35 + n3 * 0.2);
    n = n * 0.35 + 0.5;
    float lo = 0.5 - u_softness * 0.5;
    float hi = 0.5 + u_softness * 0.5;
    n = smoothstep(lo, hi, n);
    n = n * n * (3.0 - 2.0 * n);
    vec3 black = vec3(0.04, 0.04, 0.05);
    vec3 white = vec3(0.96, 0.95, 0.93);
    vec3 color = mix(black, white, n);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const bgMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: {
      u_time:       { value: 0 },
      u_speed:      { value: 0.16 },
      u_scale:      { value: 0.5 },
      u_softness:   { value: 0.9 },
      u_resolution: { value: new THREE.Vector2(
        window.innerWidth * renderer.getPixelRatio(),
        window.innerHeight * renderer.getPixelRatio()
      )},
    },
    vertexShader: /* glsl */`
      varying vec2 v_uv;
      void main() {
        v_uv = uv;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }
    `,
    fragmentShader: bgFragmentShader,
    depthWrite: false,
    depthTest: false,
  })
);
bgScene.add(bgMesh);
gui.add(bgMesh.material.uniforms.u_time, "value").min(0).max(10).step(0.1).name("u_time");
gui.add(bgMesh.material.uniforms.u_speed, "value").min(0).max(1).step(0.1).name("u_speed");
gui.add(bgMesh.material.uniforms.u_scale, "value").min(0).max(1).step(0.1).name("u_scale");
gui.add(bgMesh.material.uniforms.u_softness, "value").min(0).max(1).step(0.1).name("u_softness");
// Lights（ShaderMaterialには効かないため削除済み）

// ============================================================
// CARDS
// ============================================================
const cardGroup = new THREE.Group();
cardGroup.rotation.z = Math.PI * .1;
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
        uOpacity:    { value: 2.0 },
        uUvOffset:   { value: new THREE.Vector2(0, 0) },
        uCardY:      { value: 0.0 },
        uBendStart:  { value: CFG.bendStart },
        uBendRadius: { value: CFG.bendRadius },
        uBendArc: { value: bendArcLength },
        uTime:    { value: 0 },
        uBrightness: { value: 1.0 },
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
          elevation += sin(modelPosition.y * 1. + uTime * 2.) * 0.02;
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
        uniform float uBrightness;
        uniform vec2 uUvOffset;
        varying float vElevation;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;

        void main() {
          vec2 uv = vUv + uUvOffset;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec4 texColor = texture2D(map, uv);
          // フラットライティング + elevation + brightness
          vec3 color = texColor.rgb * uBrightness * max(1.0, 1.0 + vElevation * 2.0);
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

// Brightness GUI（全カード共通）
const brightnessCtrl = { brightness: 1.0 };
gui.add(brightnessCtrl, 'brightness', 0, 3, 0.05).name('brightness').onChange(v => {
  cards.forEach(c => { c.material.uniforms.uBrightness.value = v; });
});

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
// PROJECT LABEL (center card title)
// ============================================================
const projectLabelEl = document.getElementById('project-label');
const projectTitleEl = projectLabelEl.querySelector('.title');
const projectCategoryEl = projectLabelEl.querySelector('.category');
const projectLinkEl = projectLabelEl.querySelector('.link');
let currentCenterProject = null;

// ============================================================
// HELPERS
// ============================================================
function lerp(a, b, t) { return a + (b - a) * t; }
function mod(n, m) { return ((n % m) + m) % m; }

// ============================================================
// RENDER LOOP
// ============================================================
let rafId;
function animate() {
  rafId = requestAnimationFrame(animate);
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

    // uniform 更新
    card.position.y = y;
    card.position.z = -CFG.radius;
    card.rotation.x = scrollVelocity * 0.35;
    card.material.uniforms.uCardY.value = y;
  });

  // Center card title detection
  let closestDist = Infinity;
  let closestCard = null;
  cards.forEach(card => {
    const d = Math.abs(card.position.y);
    if (d < closestDist) {
      closestDist = d;
      closestCard = card;
    }
  });

  const centerThreshold = cardStep * 0.5;
  if (closestCard && closestDist < centerThreshold) {
    const proj = closestCard.userData.project;
    if (proj !== currentCenterProject) {
      currentCenterProject = proj;
      // 一文字ずつspanで囲む
      projectTitleEl.innerHTML = [...proj.title].map((ch, i) =>
        `<span style="animation-delay:${i * 0.04}s">${ch === ' ' ? '&nbsp;' : ch}</span>`
      ).join('');
      projectCategoryEl.textContent = proj.category;
      projectLinkEl.setAttribute("href", proj.link)
    }
    // ラベルのY位置をカードのスクリーン座標に合わせる
    // const screenPos = new THREE.Vector3(0, closestCard.position.y, -CFG.radius).project(camera);
    // const screenY = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    // projectLabelEl.style.top = screenY + 'px';
    // 中央に近いほど不透明にする
    const opacity = 1;
    projectLabelEl.style.opacity = opacity;
    projectLabelEl.classList.add('visible');
  } else {
    projectLabelEl.classList.remove('visible');
    currentCenterProject = null;
  }

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

  // Background shader update & render
  bgMesh.material.uniforms.u_time.value = elapsedTime;

  renderer.clear();
  renderer.render(bgScene, bgCamera);
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
  bgMesh.material.uniforms.u_resolution.value.set(
    window.innerWidth  * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio()
  );
});

return {
  renderer,
  destroy() {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  },
};
}

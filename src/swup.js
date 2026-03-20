import Swup from 'swup';
import { gsap } from 'gsap';
import initThreeScene from './main';

const swup = new Swup({
  containers: ['#swup'],
  animation: { animate: false },
});

let scene = initThreeScene();

// 離脱: 旧コンテンツのDOMをそのままbodyに退避
swup.hooks.on('animation:out:await', async () => {
  const container = document.querySelector('#swup');
  const ghost = document.createElement('div');
  ghost.id = 'swup-ghost';
  ghost.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';

  while (container.firstChild) {
    ghost.appendChild(container.firstChild);
  }
  document.body.appendChild(ghost);
  container.style.opacity = '0';
});

// 進入: 新ページが下からスライドして被さる
swup.hooks.on('animation:in:await', async () => {
  const container = document.querySelector('#swup');
  const oldScene = scene;
  if (document.getElementById('canvas-container')) {
    scene = initThreeScene();
  }

  const ghost = document.getElementById('swup-ghost');

  gsap.set(container, { y: '100%', opacity: 1 });
  const tl = gsap.timeline()
  if (ghost) {
  await tl.to(ghost, {
    opacity: 0,
    duration: 0.4,
    }).to(container, {
    y: '0%',
    duration: 1.3,
    ease: 'expo.inOut',
  });
  }

  // 旧ループ停止 + renderer破棄 + ghost除去
  if (oldScene) oldScene.destroy();
  if (ghost) ghost.remove();
});

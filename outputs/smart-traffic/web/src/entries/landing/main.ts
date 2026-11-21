import { initTheme } from '../../theme/theme';

initTheme();

const root = document.documentElement;
root.classList.add('js');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealables = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

const revealAll = () => {
  for (const element of revealables) element.classList.add('is-in');
};

if (reduceMotion.matches || !('IntersectionObserver' in window)) {
  revealAll();
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );

  for (const element of revealables) observer.observe(element);
  reduceMotion.addEventListener?.('change', (event) => {
    if (event.matches) revealAll();
  });
}

const head = document.querySelector<HTMLElement>('[data-head]');
if (head) {
  let queued = false;
  const syncHead = () => {
    head.classList.toggle('is-scrolled', window.scrollY > 24);
    queued = false;
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(syncHead);
  };

  syncHead();
  window.addEventListener('scroll', onScroll, { passive: true });
}

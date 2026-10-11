const QUERY = '(prefers-reduced-motion: reduce)';

export function getReducedMotion() {
  return typeof window === 'undefined' || window.matchMedia(QUERY).matches;
}

export function subscribeReducedMotion(onChange) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

// A static hero is also the safe server-rendered snapshot.
export const getServerReducedMotion = () => true;

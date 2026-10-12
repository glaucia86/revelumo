import React from 'react';

// Small, locally authored outline glyphs. All uses have a visible text label.
const paths = {
  import: <><path d="M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6"/></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/></>,
  refresh: <><path d="M20 5v6h-6M4 19v-6h6M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="catalog-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

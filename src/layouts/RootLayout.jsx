import React from 'react';
import { Outlet } from 'react-router-dom';

// Shared shell for every route. vite-react-ssg already wraps the tree in
// HelmetProvider. Scroll reveals are handled by the native IntersectionObserver
// primitive in src/lib/reveal.js, initialized per-page.
export function RootLayout() {
  return (
    <>
      <aside style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2147483647, padding: '10px 16px', background: '#123b8a', color: '#fff', textAlign: 'center', font: '600 14px system-ui' }} aria-label="Test environment">
        BLUE · Production is unchanged · WhatsApp replies require account activation
      </aside>
      <Outlet />
    </>
  );
}

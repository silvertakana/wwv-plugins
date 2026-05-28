"use client";

import React, { useEffect, useRef, useState } from "react";
// Inline gridstack CSS as a raw string. Loading the stylesheet from
// `unpkg.com/gridstack` is blocked by the host app's Content Security
// Policy (`style-src 'self' 'unsafe-inline' fonts.googleapis.com`), so
// without this the grid loses its positioning rules and all widgets
// stack vertically at full width.
// The `?inline` suffix tells Vite to bundle the CSS as a string we can
// inject via a <style> tag, which `'unsafe-inline'` permits.
import gridstackCss from "gridstack/dist/gridstack.min.css?inline";

interface GridstackWrapperProps {
  children: React.ReactNode;
  onChange?: (event: Event, items: any[]) => void;
}

export default function GridstackWrapper({ children, onChange }: GridstackWrapperProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridInitialized, setGridInitialized] = useState(false);

  useEffect(() => {
    let grid: any = null;
    let isMounted = true;

    // Inject gridstack's stylesheet inline. We avoid loading from a CDN
    // because the host page's CSP blocks external style-src origins. An
    // inline <style> tag is allowed by `'unsafe-inline'` and ships zero
    // extra network requests.
    const styleId = "wwv-plugin-market-tracker-css";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = gridstackCss;
      document.head.appendChild(styleEl);
    }

    // Dynamically import gridstack on the client
    import("gridstack").then(({ GridStack }) => {
      if (!isMounted) return;
      
      try {
        if (gridRef.current) {
          grid = GridStack.init(
            {
              column: 12,
              minRow: 1,
              margin: 10,
              cellHeight: 120,
              animate: true,
              draggable: { handle: ".widget-drag-handle" },
              resizable: { handles: "e, se, s, sw, w" },
              columnOpts: {
                breakpointForWindow: true,
                breakpoints: [
                  { w: 700, c: 6 },
                  { w: 1100, c: 12 },
                ],
                layout: "moveScale",
              },
            },
            gridRef.current
          );

          if (onChange) {
            grid.on("change", onChange);
          }

          setGridInitialized(true);
        }
      } catch (err) {
        console.error("[GridstackWrapper] Initialization error:", err);
      }
    }).catch(err => {
      console.error("[GridstackWrapper] Import error:", err);
    });

    return () => {
      isMounted = false;
      if (grid) {
        try {
          grid.destroy(false); // false means don't remove the DOM elements
        } catch (e) {
          console.warn("[GridstackWrapper] Cleanup error:", e);
        }
      }
    };
  }, [onChange]);

  return (
    <div className="grid-stack" ref={gridRef} style={{ opacity: gridInitialized ? 1 : 0, transition: "opacity 0.3s ease" }}>
      {children}
    </div>
  );
}

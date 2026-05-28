"use client";

import React, { useEffect, useRef, useState } from "react";
// Dynamic import of gridstack ensures it never runs on the server.
// CSS is loaded at runtime via a <link> tag injected in useEffect (see below) —
// importing the CSS here would cause Vite to leave a bare ES import in the
// bundle, which browsers cannot resolve without an importmap.

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

    // Load gridstack's stylesheet from the unpkg CDN at runtime. We avoid an
    // ES-style `import "gridstack/dist/gridstack.min.css"` because the host
    // browser cannot resolve bare module specifiers.
    const linkId = "wwv-plugin-market-tracker-css";
    let link = document.getElementById(linkId) as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/gridstack@11/dist/gridstack.min.css";
      document.head.appendChild(link);
    }

    // Dynamically import gridstack on the client
    import("gridstack").then(({ GridStack }) => {
      if (!isMounted) return;
      
      try {
        if (gridRef.current) {
          grid = GridStack.init(
            {
              margin: 10,
              cellHeight: 120,
              draggable: { handle: ".widget-drag-handle" },
              resizable: { handles: "e, se, s, sw, w" },
              animate: true,
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

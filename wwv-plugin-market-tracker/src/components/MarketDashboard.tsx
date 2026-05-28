"use client";

import React, { useState, useEffect } from "react";
import GridstackWrapper from "./GridstackWrapper";
import StockWidget from "./StockWidget";

const DEFAULT_LAYOUT = [
  { id: "AAPL", ticker: "AAPL", x: 0, y: 0, w: 2, h: 1 },
  { id: "MSFT", ticker: "MSFT", x: 2, y: 0, w: 2, h: 1 },
  { id: "NVDA", ticker: "NVDA", x: 4, y: 0, w: 2, h: 1 },
  { id: "SPY",  ticker: "SPY",  x: 0, y: 1, w: 3, h: 1 },
  { id: "QQQ",  ticker: "QQQ",  x: 3, y: 1, w: 3, h: 1 },
];

export default function MarketDashboard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: 20, color: "#9ca3af", textAlign: "center" }}>
        Loading Market Dashboard...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: "10px", overflowY: "auto" }}>
      <GridstackWrapper>
        {DEFAULT_LAYOUT.map((widget) => (
          <div
            key={widget.id}
            className="grid-stack-item"
            gs-id={widget.id}
            gs-x={widget.x}
            gs-y={widget.y}
            gs-w={widget.w}
            gs-h={widget.h}
            gs-min-w={2}
            gs-min-h={1}
          >
            <StockWidget id={widget.id} ticker={widget.ticker} />
          </div>
        ))}
      </GridstackWrapper>
    </div>
  );
}

"use client";

import React, { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { GripHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { useMarketStore } from "../store/marketStore";

interface StockWidgetProps {
  id: string; // The widget ID from gridstack
  ticker: string; // e.g. "AAPL"
}

export default function StockWidget({ id, ticker }: StockWidgetProps) {
  // Subscribe specifically to this ticker's data to avoid unnecessary re-renders
  const data = useMarketStore((state) => state.tickers[ticker]);

  // Transform sparkline array into objects for Recharts
  const chartData = useMemo(() => {
    if (!data || !data.sparkline) return [];
    return data.sparkline.map((val, index) => ({ value: val, index }));
  }, [data?.sparkline]);

  // No data yet — render a quiet placeholder rather than a permanent
  // "Loading..." string. The seeder returns null when the US market is
  // closed (outside 09:30-16:00 ET), so the WS never delivers a snapshot
  // and "Loading" would be misleading. Same placeholder also covers
  // engine restarts, network blips, and the brief gap before the first
  // tick after the market opens.
  if (!data) {
    return (
      <div
        className="grid-stack-item-content"
        style={{
          background: "rgba(26, 29, 36, 0.7)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        }}
      >
        <div
          className="widget-drag-handle"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
            cursor: "grab",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 600, color: "#f3f4f6", fontSize: "14px" }}>{ticker}</span>
            <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>--%</span>
          </div>
          <GripHorizontal size={16} color="#6b7280" />
        </div>
        <div
          style={{
            padding: "12px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#6b7280",
                letterSpacing: "-0.5px",
              }}
            >
              $---.--
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
              Market closed or awaiting data
            </div>
          </div>
          <div style={{ height: "40px", width: "100%", marginTop: "auto" }} />
        </div>
      </div>
    );
  }

  const isPositive = data.changePercent >= 0;
  const color = isPositive ? "#10b981" : "#ef4444"; // Emerald or Red

  return (
    <div
      className="grid-stack-item-content"
      style={{
        background: "rgba(26, 29, 36, 0.7)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
      }}
    >
      {/* Header bar with drag handle */}
      <div
        className="widget-drag-handle"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
          cursor: "grab",
          background: "rgba(0, 0, 0, 0.2)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontWeight: 600, color: "#f3f4f6", fontSize: "14px" }}>{ticker}</span>
          <span style={{ display: "flex", alignItems: "center", fontSize: "12px", color, fontWeight: 500 }}>
            {isPositive ? <TrendingUp size={14} style={{ marginRight: 4 }} /> : <TrendingDown size={14} style={{ marginRight: 4 }} />}
            {Math.abs(data.changePercent).toFixed(2)}%
          </span>
        </div>
        <GripHorizontal size={16} color="#6b7280" />
      </div>

      {/* Main content body */}
      <div style={{ padding: "12px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.5px" }}>
            ${data.price.toFixed(2)}
          </div>
        </div>

        {/* Sparkline chart */}
        <div style={{ height: "40px", width: "100%", marginTop: "auto" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false} // Disable animation for high-frequency updates
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

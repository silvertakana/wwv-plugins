"use client";

import React, { useState, useEffect } from "react";
import GridstackWrapper from "./GridstackWrapper";
import StockWidget from "./StockWidget";
import { useMarketStore, type StockTick } from "../store/marketStore";

const DEFAULT_LAYOUT = [
  { id: "AAPL", ticker: "AAPL", x: 0, y: 0, w: 6, h: 2 },
  { id: "MSFT", ticker: "MSFT", x: 6, y: 0, w: 6, h: 2 },
  { id: "NVDA", ticker: "NVDA", x: 0, y: 2, w: 6, h: 2 },
  { id: "SPY",  ticker: "SPY",  x: 6, y: 2, w: 6, h: 2 },
  { id: "QQQ",  ticker: "QQQ",  x: 0, y: 4, w: 6, h: 2 },
];

const TICKERS = DEFAULT_LAYOUT.map((w) => w.ticker);
const EOD_FALLBACK_DELAY_MS = 3000;

/**
 * Fetch end-of-day price data from Yahoo Finance's free chart API.
 *
 * Yahoo's `query1.finance.yahoo.com` endpoint does NOT send
 * `Access-Control-Allow-Origin`, so the browser blocks direct calls. We
 * route through the open-source `corsproxy.io` relay which adds the
 * permissive CORS header. This is read-only EOD data — no credentials
 * or PII are involved.
 */
async function fetchEodTick(ticker: string): Promise<StockTick | null> {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=1d&range=5d`;
    const url = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    const closesRaw: unknown = result?.indicators?.quote?.[0]?.close;
    if (!meta || !Array.isArray(closesRaw)) return null;
    // Filter nulls (Yahoo sometimes includes nulls for non-trading days)
    const closes = (closesRaw as Array<number | null>).filter(
      (v): v is number => typeof v === "number"
    );
    const price: number =
      typeof meta.regularMarketPrice === "number"
        ? meta.regularMarketPrice
        : closes[closes.length - 1];
    // Previous close: second-to-last daily close (today's "previousClose")
    const prev: number | undefined =
      closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;
    if (typeof price !== "number" || typeof prev !== "number" || prev === 0) {
      return null;
    }
    const changePercent = (price / prev - 1) * 100;
    return {
      id: ticker,
      price,
      changePercent,
      timestamp: Date.now(),
      // Use the full daily close series as the sparkline for visual context
      sparkline: closes.length > 0 ? closes : [price],
    };
  } catch (err) {
    console.warn(`[market-tracker] EOD fetch failed for ${ticker}:`, err);
    return null;
  }
}

export default function MarketDashboard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // EOD fallback: if the WebSocket hasn't delivered any data within
  // EOD_FALLBACK_DELAY_MS (market closed, engine offline, etc.), fetch
  // end-of-day prices from Yahoo Finance directly so widgets aren't stuck
  // on "$---.--".
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      const currentTickers = useMarketStore.getState().tickers;
      if (Object.keys(currentTickers).length > 0) {
        // Live data already arrived via the DataBus/WebSocket pipeline.
        return;
      }
      const results = await Promise.all(TICKERS.map((t) => fetchEodTick(t)));
      if (cancelled) return;
      const eodTicks = results.filter((t): t is StockTick => t !== null);
      if (eodTicks.length > 0) {
        useMarketStore.getState().updatePrices(eodTicks);
      }
    }, EOD_FALLBACK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mounted]);

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
            gs-min-w={3}
            gs-min-h={2}
          >
            <StockWidget id={widget.id} ticker={widget.ticker} />
          </div>
        ))}
      </GridstackWrapper>
    </div>
  );
}

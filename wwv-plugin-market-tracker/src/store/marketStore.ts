import { create } from "zustand";

export interface StockTick {
  id: string; // Ticker (e.g., AAPL)
  price: number;
  changePercent: number;
  timestamp: number;
  sparkline: number[];
}

export interface MarketState {
  tickers: Record<string, StockTick>;
  updatePrices: (newTicks: StockTick[]) => void;
}

export const useMarketStore = create<MarketState>()((set) => ({
  tickers: {},
  updatePrices: (newTicks) => set((state) => {
    const updatedTickers = { ...state.tickers };

    for (const tick of newTicks) {
      const existing = updatedTickers[tick.id];
      // Three cases for the sparkline:
      // 1. No existing data AND the tick carries a multi-point series
      //    (EOD bootstrap): use it directly.
      // 2. No existing data AND only a single price: start the series.
      // 3. Existing data: append the new live price.
      let sparkline: number[];
      if (existing) {
        sparkline = [...existing.sparkline, tick.price].slice(-20);
      } else if (tick.sparkline && tick.sparkline.length > 1) {
        sparkline = tick.sparkline.slice(-20);
      } else {
        sparkline = [tick.price];
      }

      updatedTickers[tick.id] = { ...tick, sparkline };
    }

    return { tickers: updatedTickers };
  })
}));

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
      // Keep last 20 prices for sparkline
      const sparkline = existing
        ? [...existing.sparkline, tick.price].slice(-20)
        : [tick.price];

      updatedTickers[tick.id] = { ...tick, sparkline };
    }

    return { tickers: updatedTickers };
  })
}));

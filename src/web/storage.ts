/** A single, product-owned key prevents this app from disturbing sibling sites. */
export const RANKING_STORAGE_KEY = "daniel-mehta:mls-trade-value-elo:ranking-state";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStoredRankingResult =
  | { kind: "missing" }
  | { kind: "success"; value: string }
  | { kind: "unavailable"; error: unknown };

export type StorageMutationResult =
  | { kind: "success" }
  | { kind: "unavailable"; error: unknown };

/**
 * Keeps browser-storage failure handling and the key out of session and DOM
 * code. Tests can provide a tiny in-memory StorageLike implementation.
 */
export class RankingStorageAdapter {
  constructor(private readonly storage: StorageLike) {}

  loadRankingState(): LoadStoredRankingResult {
    try {
      const value = this.storage.getItem(RANKING_STORAGE_KEY);
      return value === null ? { kind: "missing" } : { kind: "success", value };
    } catch (error) {
      return { kind: "unavailable", error };
    }
  }

  saveRankingState(value: string): StorageMutationResult {
    try {
      this.storage.setItem(RANKING_STORAGE_KEY, value);
      return { kind: "success" };
    } catch (error) {
      return { kind: "unavailable", error };
    }
  }

  removeRankingState(): StorageMutationResult {
    try {
      this.storage.removeItem(RANKING_STORAGE_KEY);
      return { kind: "success" };
    } catch (error) {
      return { kind: "unavailable", error };
    }
  }
}

import { SearchFilters } from "@/features/search/utils.ts";

const SEARCH_STATE_STORAGE_KEY = "noodle-map:search-state:v1";
const SAVED_SEARCH_STATE_VERSION = 1;

export type MapCenter = [number, number];

export type SavedSearchState = {
  version: typeof SAVED_SEARCH_STATE_VERSION;
  query: string;
  filters: SearchFilters;
  mapCenter?: MapCenter;
};

export const DEFAULT_FILTERS: SearchFilters = {
  visited: true,
  wish: true,
  closed: false,
  ramen: true,
  udon: true,
  favMin: 0,
};

function isMapCenter(value: unknown): value is MapCenter {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isSearchFilters(value: unknown): value is SearchFilters {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SearchFilters>;
  return (
    typeof candidate.visited === "boolean" &&
    typeof candidate.wish === "boolean" &&
    typeof candidate.closed === "boolean" &&
    typeof candidate.ramen === "boolean" &&
    typeof candidate.udon === "boolean" &&
    typeof candidate.favMin === "number"
  );
}

function normalizeSavedSearchState(value: unknown): SavedSearchState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SavedSearchState> & {
    favMin?: unknown;
    filters?: unknown;
  };
  if (
    candidate.version !== SAVED_SEARCH_STATE_VERSION ||
    typeof candidate.query !== "string" ||
    !candidate.filters
  ) {
    return null;
  }

  if (isSearchFilters(candidate.filters)) {
    return {
      version: SAVED_SEARCH_STATE_VERSION,
      query: candidate.query,
      filters: candidate.filters,
      mapCenter: isMapCenter(candidate.mapCenter)
        ? candidate.mapCenter
        : undefined,
    };
  }

  const legacyFilters = candidate.filters as
    | Partial<Record<keyof SearchFilters, unknown>>
    | undefined;
  if (
    typeof candidate.favMin === "number" &&
    typeof legacyFilters?.visited === "boolean" &&
    typeof legacyFilters.wish === "boolean" &&
    typeof legacyFilters.closed === "boolean" &&
    typeof legacyFilters.ramen === "boolean" &&
    typeof legacyFilters.udon === "boolean"
  ) {
    return {
      version: SAVED_SEARCH_STATE_VERSION,
      query: candidate.query,
      filters: {
        visited: legacyFilters.visited,
        wish: legacyFilters.wish,
        closed: legacyFilters.closed,
        ramen: legacyFilters.ramen,
        udon: legacyFilters.udon,
        favMin: candidate.favMin,
      },
      mapCenter: isMapCenter(candidate.mapCenter)
        ? candidate.mapCenter
        : undefined,
    };
  }

  return null;
}

export function readSavedSearchState(): SavedSearchState | null {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return normalizeSavedSearchState(parsed);
  } catch {
    return null;
  }
}

export function writeSavedSearchState(
  state: Omit<SavedSearchState, "version">,
) {
  try {
    localStorage.setItem(
      SEARCH_STATE_STORAGE_KEY,
      JSON.stringify({ version: SAVED_SEARCH_STATE_VERSION, ...state }),
    );
  } catch {
    // Storage can be unavailable in restricted browsing modes.
  }
}

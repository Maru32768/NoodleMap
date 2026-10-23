import { SearchFilters } from "@/features/search/utils.ts";
import { DEFAULT_SYSTEM_TAG_SELECTION } from "@/features/shops/status.ts";

const SEARCH_STATE_STORAGE_KEY = "noodle-map:search-state:v1";
const SAVED_SEARCH_STATE_VERSION = 5;

export type MapCenter = [number, number];

export type MapView = {
  center: MapCenter;
  zoom: number;
};

export const DEFAULT_MAP_VIEW: MapView = {
  center: [35.6895315, 139.700492],
  zoom: 13,
};

export type SavedSearchState = {
  version: typeof SAVED_SEARCH_STATE_VERSION;
  query: string;
  filters: SearchFilters;
  mapView: MapView;
};

export const DEFAULT_FILTERS: SearchFilters = {
  eaten: true,
  wish: true,
  ramen: true,
  udon: true,
  favMin: 0,
  // Status is filtered via system tags in tagIds; default to all but 閉店.
  tagIds: [...DEFAULT_SYSTEM_TAG_SELECTION],
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

function isMapView(value: unknown): value is MapView {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<MapView>;
  return (
    isMapCenter(candidate.center) &&
    typeof candidate.zoom === "number" &&
    Number.isFinite(candidate.zoom)
  );
}

function isSearchFilters(value: unknown): value is SearchFilters {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SearchFilters>;
  return (
    typeof candidate.eaten === "boolean" &&
    typeof candidate.wish === "boolean" &&
    typeof candidate.ramen === "boolean" &&
    typeof candidate.udon === "boolean" &&
    typeof candidate.favMin === "number" &&
    Array.isArray(candidate.tagIds) &&
    candidate.tagIds.every((id) => typeof id === "string")
  );
}

function normalizeSavedSearchState(value: unknown): SavedSearchState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SavedSearchState>;
  if (
    candidate.version !== SAVED_SEARCH_STATE_VERSION ||
    typeof candidate.query !== "string" ||
    !isSearchFilters(candidate.filters) ||
    !isMapView(candidate.mapView)
  ) {
    return null;
  }

  return {
    version: SAVED_SEARCH_STATE_VERSION,
    query: candidate.query,
    filters: candidate.filters,
    mapView: candidate.mapView,
  };
}

// Also removes a saved entry that is unreadable or from an older version.
export function readSavedSearchState(): SavedSearchState | null {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    const state = normalizeSavedSearchState(parsed);
    if (!state) {
      localStorage.removeItem(SEARCH_STATE_STORAGE_KEY);
    }
    return state;
  } catch {
    removeSavedSearchState();
    return null;
  }
}

function removeSavedSearchState() {
  try {
    localStorage.removeItem(SEARCH_STATE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in restricted browsing modes.
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

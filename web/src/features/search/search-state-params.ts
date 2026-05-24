import { FilterToggles, SearchFilters } from "@/features/search/utils.ts";

export const KEYWORD_PARAM_NAME = "q";
export const LAT_PARAM_NAME = "lat";
export const LNG_PARAM_NAME = "lng";
export const FAV_MIN_PARAM_NAME = "fav";
// Filter toggles: "1" = shown, "0" = hidden
export const SHOW_VISITED_PARAM = "sv";
export const SHOW_WISH_PARAM = "sw";
export const SHOW_CLOSED_PARAM = "sc";
export const SHOW_RAMEN_PARAM = "sr";
export const SHOW_UDON_PARAM = "su";

const SEARCH_STATE_STORAGE_KEY = "noodle-map:search-state:v1";
const SAVED_SEARCH_STATE_VERSION = 1;

export type SavedSearchState = {
  version: typeof SAVED_SEARCH_STATE_VERSION;
  query: string;
  filters: SearchFilters;
};

export const DEFAULT_FILTERS: SearchFilters = {
  visited: true,
  wish: true,
  closed: false,
  ramen: true,
  udon: true,
  favMin: 0,
};

export const FILTER_PARAM: Record<keyof FilterToggles, string> = {
  visited: SHOW_VISITED_PARAM,
  wish: SHOW_WISH_PARAM,
  closed: SHOW_CLOSED_PARAM,
  ramen: SHOW_RAMEN_PARAM,
  udon: SHOW_UDON_PARAM,
};

const DEFAULT_SEARCH_PARAMS = {
  [KEYWORD_PARAM_NAME]: "",
  [FAV_MIN_PARAM_NAME]: "0",
  [SHOW_VISITED_PARAM]: "1",
  [SHOW_WISH_PARAM]: "1",
  [SHOW_CLOSED_PARAM]: "0",
  [SHOW_RAMEN_PARAM]: "1",
  [SHOW_UDON_PARAM]: "1",
};

const SEARCH_STATE_PARAM_NAMES = [
  KEYWORD_PARAM_NAME,
  FAV_MIN_PARAM_NAME,
  SHOW_VISITED_PARAM,
  SHOW_WISH_PARAM,
  SHOW_CLOSED_PARAM,
  SHOW_RAMEN_PARAM,
  SHOW_UDON_PARAM,
];

function readBoolParam(
  params: URLSearchParams,
  name: string,
  defaultValue: boolean,
): boolean {
  const v = params.get(name);
  return v === null ? defaultValue : v === "1";
}

export function readFavMinParam(params: URLSearchParams): number {
  const n = parseInt(params.get(FAV_MIN_PARAM_NAME) ?? "0", 10);
  return Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
}

export function readFiltersFromParams(params: URLSearchParams): SearchFilters {
  return {
    visited: readBoolParam(params, SHOW_VISITED_PARAM, DEFAULT_FILTERS.visited),
    wish: readBoolParam(params, SHOW_WISH_PARAM, DEFAULT_FILTERS.wish),
    closed: readBoolParam(params, SHOW_CLOSED_PARAM, DEFAULT_FILTERS.closed),
    ramen: readBoolParam(params, SHOW_RAMEN_PARAM, DEFAULT_FILTERS.ramen),
    udon: readBoolParam(params, SHOW_UDON_PARAM, DEFAULT_FILTERS.udon),
    favMin: readFavMinParam(params),
  };
}

function hasSearchStateParams(params: URLSearchParams): boolean {
  return SEARCH_STATE_PARAM_NAMES.some((name) => params.has(name));
}

function isSavedSearchState(value: unknown): value is SavedSearchState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SavedSearchState>;
  return (
    candidate.version === SAVED_SEARCH_STATE_VERSION &&
    typeof candidate.query === "string" &&
    !!candidate.filters &&
    typeof candidate.filters.visited === "boolean" &&
    typeof candidate.filters.wish === "boolean" &&
    typeof candidate.filters.closed === "boolean" &&
    typeof candidate.filters.ramen === "boolean" &&
    typeof candidate.filters.udon === "boolean" &&
    typeof candidate.filters.favMin === "number"
  );
}

function normalizeSavedSearchState(value: unknown): SavedSearchState | null {
  if (isSavedSearchState(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<SavedSearchState> & {
    favMin?: unknown;
  };
  if (
    candidate.version !== SAVED_SEARCH_STATE_VERSION ||
    typeof candidate.query !== "string" ||
    typeof candidate.favMin !== "number" ||
    !candidate.filters ||
    typeof candidate.filters.visited !== "boolean" ||
    typeof candidate.filters.wish !== "boolean" ||
    typeof candidate.filters.closed !== "boolean" ||
    typeof candidate.filters.ramen !== "boolean" ||
    typeof candidate.filters.udon !== "boolean"
  ) {
    return null;
  }

  return {
    version: SAVED_SEARCH_STATE_VERSION,
    query: candidate.query,
    filters: {
      visited: candidate.filters.visited,
      wish: candidate.filters.wish,
      closed: candidate.filters.closed,
      ramen: candidate.filters.ramen,
      udon: candidate.filters.udon,
      favMin: candidate.favMin,
    },
  };
}

function readSavedSearchState(): SavedSearchState | null {
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

export function applySavedSearchState(
  params: URLSearchParams,
  state: SavedSearchState,
) {
  params.set(KEYWORD_PARAM_NAME, state.query);
  params.set(FAV_MIN_PARAM_NAME, String(state.filters.favMin));
  for (const [key, paramName] of Object.entries(FILTER_PARAM) as [
    keyof FilterToggles,
    string,
  ][]) {
    params.set(paramName, state.filters[key] ? "1" : "0");
  }
}

export function createInitialSearchParams() {
  const params = new URLSearchParams(DEFAULT_SEARCH_PARAMS);

  const currentParams = new URLSearchParams(window.location.search);
  if (hasSearchStateParams(currentParams)) {
    return { params, savedState: null };
  }

  const savedState = readSavedSearchState();
  if (savedState) {
    applySavedSearchState(params, savedState);
  }

  return { params, savedState };
}

import {
  applySavedSearchState,
  createInitialSearchParams,
  FAV_MIN_PARAM_NAME,
  FILTER_PARAM,
  KEYWORD_PARAM_NAME,
  LAT_PARAM_NAME,
  LNG_PARAM_NAME,
  readFiltersFromParams,
  writeSavedSearchState,
} from "@/features/search/search-state-params.ts";
import { FilterToggles, SearchFilters } from "@/features/search/utils.ts";
import { isEqual } from "es-toolkit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useDebouncedCallback } from "use-debounce";

export function useSearchStateParams() {
  const initialSearchState = useMemo(() => createInitialSearchParams(), []);
  const [searchParams, setSearchParams] = useSearchParams(
    initialSearchState.params,
  );

  const latParam = searchParams.get(LAT_PARAM_NAME);
  const lngParam = searchParams.get(LNG_PARAM_NAME);
  const keywordParam = searchParams.get(KEYWORD_PARAM_NAME) ?? "";

  const [initialCenter] = useState<[number, number] | undefined>(() => {
    const lat = parseFloat(latParam ?? "");
    const lng = parseFloat(lngParam ?? "");
    return isNaN(lat) || isNaN(lng) ? undefined : [lat, lng];
  });
  const [filters, setFilters] = useState<SearchFilters>(() =>
    readFiltersFromParams(searchParams),
  );

  useEffect(() => {
    const savedState = initialSearchState.savedState;
    if (!savedState) {
      return;
    }

    setSearchParams(
      (prev) => {
        const copy = new URLSearchParams(prev);
        applySavedSearchState(copy, savedState);
        return copy;
      },
      { replace: true },
    );
  }, [initialSearchState.savedState, setSearchParams]);

  useEffect(() => {
    const nextFilters = readFiltersFromParams(searchParams);

    setFilters((prev) => (isEqual(prev, nextFilters) ? prev : nextFilters));
  }, [searchParams]);

  useEffect(() => {
    writeSavedSearchState({
      query: keywordParam,
      filters,
    });
  }, [keywordParam, filters]);

  const updateKeywordDebounced = useDebouncedCallback((q: string) => {
    setSearchParams((prev) => {
      const copy = new URLSearchParams(prev);
      copy.set(KEYWORD_PARAM_NAME, q);
      return copy;
    });
  }, 300);

  const handleQueryChange = useCallback(
    (q: string) => {
      updateKeywordDebounced(q);
    },
    [updateKeywordDebounced],
  );

  const handleFilterChange = useCallback(
    <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setSearchParams((prev) => {
        const copy = new URLSearchParams(prev);
        if (key === "favMin") {
          copy.set(FAV_MIN_PARAM_NAME, String(value));
        } else {
          const toggleKey = key as keyof FilterToggles;
          copy.set(FILTER_PARAM[toggleKey], value ? "1" : "0");
        }
        return copy;
      });
    },
    [setSearchParams],
  );

  const setMapCenterParams = useCallback(
    (lat: string, lng: string) => {
      setSearchParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          copy.set(LAT_PARAM_NAME, lat);
          copy.set(LNG_PARAM_NAME, lng);
          return copy;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    filters,
    handleFilterChange,
    handleQueryChange,
    initialCenter,
    keywordParam,
    latParam,
    lngParam,
    setMapCenterParams,
  };
}

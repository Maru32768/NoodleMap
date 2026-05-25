import {
  DEFAULT_FILTERS,
  MapCenter,
  readSavedSearchState,
  writeSavedSearchState,
} from "@/features/search/search-state-storage.ts";
import { SearchFilters } from "@/features/search/utils.ts";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useSearchState() {
  const savedState = useMemo(() => readSavedSearchState(), []);
  const [query, setQuery] = useState(savedState?.query ?? "");
  const [filters, setFilters] = useState<SearchFilters>(
    savedState?.filters ?? DEFAULT_FILTERS,
  );
  const [mapCenter, setMapCenter] = useState<MapCenter | undefined>(
    savedState?.mapCenter,
  );

  useEffect(() => {
    writeSavedSearchState({
      query,
      filters,
      mapCenter,
    });
  }, [query, filters, mapCenter]);

  const handleFilterChange = useCallback(
    <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleMapCenterChange = useCallback((center: MapCenter) => {
    setMapCenter(center);
  }, []);

  return {
    filters,
    handleFilterChange,
    handleMapCenterChange,
    handleQueryChange: setQuery,
    initialCenter: savedState?.mapCenter,
    mapCenter,
    query,
  };
}

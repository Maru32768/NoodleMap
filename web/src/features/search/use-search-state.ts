import {
  DEFAULT_FILTERS,
  DEFAULT_MAP_VIEW,
  MapView,
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
  const initialMapView = savedState?.mapView ?? DEFAULT_MAP_VIEW;
  const [mapView, setMapView] = useState<MapView>(initialMapView);

  useEffect(() => {
    writeSavedSearchState({
      query,
      filters,
      mapView,
    });
  }, [query, filters, mapView]);

  const handleFilterChange = useCallback(
    <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleMapViewChange = useCallback((view: MapView) => {
    setMapView(view);
  }, []);

  return {
    filters,
    handleFilterChange,
    handleMapViewChange,
    handleQueryChange: setQuery,
    initialMapView,
    mapView,
    query,
  };
}

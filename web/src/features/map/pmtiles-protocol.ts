import maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url";
import { Protocol } from "pmtiles";

const PMTILES_PROTOCOL_KEY = "__noodleMapPmtilesProtocolAdded";

declare global {
  interface Window {
    [PMTILES_PROTOCOL_KEY]?: boolean;
  }
}

export function initializeMapLibreRuntime() {
  // Use MapLibre's prebuilt worker directly. Vite/Rolldown production bundling
  // can break the default worker and prevent GeoJSON overlays from rendering.
  maplibregl.setWorkerUrl(workerUrl);

  if (window[PMTILES_PROTOCOL_KEY]) {
    return;
  }

  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  window[PMTILES_PROTOCOL_KEY] = true;
}

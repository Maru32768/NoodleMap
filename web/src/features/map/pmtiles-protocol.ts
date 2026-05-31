import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

const PMTILES_PROTOCOL_KEY = "__noodleMapPmtilesProtocolAdded";

declare global {
  interface Window {
    [PMTILES_PROTOCOL_KEY]?: boolean;
  }
}

export function ensurePmTilesProtocol() {
  if (window[PMTILES_PROTOCOL_KEY]) {
    return;
  }

  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  window[PMTILES_PROTOCOL_KEY] = true;
}

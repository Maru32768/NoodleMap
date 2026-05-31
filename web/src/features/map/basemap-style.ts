import { layers, namedFlavor } from "@protomaps/basemaps";
import { LayerSpecification, StyleSpecification } from "maplibre-gl";

const PROTOMAPS_SOURCE_ID = "protomaps";
const PMTILES_PROTOCOL_PREFIX = "pmtiles://";
const PROTOMAPS_ASSETS_BASE = "https://protomaps.github.io/basemaps-assets";
const PMTILES_MAX_ZOOM = 15;
const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> | <a href="https://protomaps.com">Protomaps</a>';
const EXCLUDED_LAYER_ID_PATTERNS = [
  /^address_/u,
  /^buildings/u,
  /^roads_oneway/u,
  /^roads_shields/u,
  /^roads_labels_minor/u,
  /^roads_tunnels_/u,
  /^roads_bridges_/u,
  /^roads_.*_casing/u,
  /^water_waterway_label/u,
  /^earth_label_islands/u,
  /^landcover/u,
  /^landuse_(hospital|industrial|school|zoo|aerodrome|pedestrian|pier|runway)$/u,
];

function toPmTilesUrl(url: string) {
  return url.startsWith(PMTILES_PROTOCOL_PREFIX)
    ? url
    : `${PMTILES_PROTOCOL_PREFIX}${url}`;
}

function isLightweightLayer(layer: LayerSpecification) {
  return !EXCLUDED_LAYER_ID_PATTERNS.some((pattern) => pattern.test(layer.id));
}

function keepTransitStations(layer: LayerSpecification): LayerSpecification {
  if (layer.id !== "pois" || layer.type !== "symbol") {
    return layer;
  }

  return {
    ...layer,
    filter: [
      "all",
      ["==", ["get", "kind"], "station"],
      [">=", ["zoom"], ["+", ["get", "min_zoom"], 0]],
    ],
  } as LayerSpecification;
}

export function createBasemapStyle(): StyleSpecification {
  const pmTilesUrl = import.meta.env.VITE_BASEMAP_PMTILES_URL?.trim();
  if (pmTilesUrl) {
    return {
      version: 8,
      glyphs: `${PROTOMAPS_ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${PROTOMAPS_ASSETS_BASE}/sprites/v4/light`,
      sources: {
        [PROTOMAPS_SOURCE_ID]: {
          type: "vector",
          url: toPmTilesUrl(pmTilesUrl),
          maxzoom: PMTILES_MAX_ZOOM,
          attribution: MAP_ATTRIBUTION,
        },
      },
      layers: layers(PROTOMAPS_SOURCE_ID, namedFlavor("light"), {
        lang: "ja",
      })
        .filter(isLightweightLayer)
        .map(keepTransitStations),
    };
  }

  if (!import.meta.env.DEV) {
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#f5efe6",
          },
        },
      ],
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    };
  }

  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
        minzoom: 0,
        maxzoom: 24,
      },
    ],
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  };
}

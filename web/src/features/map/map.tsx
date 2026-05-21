import { Category } from "@/features/categories/api/use-categories.ts";
import { Restaurant } from "@/features/restaurants/api/use-restaurants.ts";
import { getCategoryType } from "@/features/search/utils.ts";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import "./map.css";

export interface MapHandle {
  getCenter: () => { lat: number; lng: number };
  flyTo: (center: [number, number]) => void;
  panTo: (
    center: [number, number],
    options?: { animate?: boolean; duration?: number },
  ) => void;
}

export interface MapEventHandler {
  (map: MapHandle, source: "user" | "programmatic"): void;
}

interface Props {
  center: [number, number] | undefined;
  categories: Category[];
  restaurants: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveEnd: MapEventHandler;
  initialZoom?: number;
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  draftLatLng?: { lat: number; lng: number } | null;
}

type State = "visited" | "wish" | "closed";

const RESTAURANTS_SOURCE_ID = "restaurants";
const RESTAURANT_PINS_LAYER_ID = "restaurant-pins";
const RESTAURANT_LABELS_LAYER_ID = "restaurant-labels";
const RESTAURANT_SELECTED_LAYER_ID = "restaurant-selected";
const DRAFT_SOURCE_ID = "draft-restaurant";
const DRAFT_LAYER_ID = "draft-restaurant-pin";
const DRAFT_IMAGE_ID = "draft-restaurant-pin-image";
const DEFAULT_CENTER: [number, number] = [35.6895315, 139.700492];
const PIN_IMAGE_PIXEL_RATIO = 2;
const PIN_IMAGE_WIDTH = 38;
const PIN_IMAGE_HEIGHT = 46;
const DEFAULT_PAN_DURATION_MS = 450;

function toLngLat(center: [number, number]): [number, number] {
  return [center[1], center[0]];
}

function buildNearestKmMap(restaurants: Restaurant[]): Map<string, number> {
  const result = new globalThis.Map<string, number>();
  for (const r of restaurants) {
    let minSq = Infinity;
    for (const o of restaurants) {
      if (o.id === r.id) {
        continue;
      }
      const dLat = (r.lat - o.lat) * 111;
      const dLng = (r.lng - o.lng) * 91;
      const dSq = dLat * dLat + dLng * dLng;
      if (dSq < minSq) {
        minSq = dSq;
      }
    }
    result.set(r.id, minSq === Infinity ? 99 : Math.sqrt(minSq));
  }
  return result;
}

function toGeoJson(restaurants: Restaurant[], categories: Category[]) {
  const nearestKmMap = buildNearestKmMap(restaurants);
  return {
    type: "FeatureCollection" as const,
    features: restaurants.map((r) => {
      const catType = getCategoryType(r, categories);
      const isVisited = r.visited;
      const isClosed = r.closed;
      const highRate = isVisited && (r.rate ?? 0) >= 80;
      const nearestKm = nearestKmMap.get(r.id) ?? 99;

      return {
        type: "Feature" as const,
        id: r.id,
        properties: {
          id: r.id,
          name: r.name,
          nearestKm,
          catType,
          state: isClosed ? "closed" : isVisited ? "visited" : "wish",
          highRate,
          icon: getPinImageId(
            isClosed ? "closed" : isVisited ? "visited" : "wish",
            catType,
            highRate,
          ),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [r.lng, r.lat],
        },
      };
    }),
  };
}

function toDraftGeoJson(draftLatLng: { lat: number; lng: number } | null) {
  return {
    type: "FeatureCollection" as const,
    features: draftLatLng
      ? [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Point" as const,
              coordinates: [draftLatLng.lng, draftLatLng.lat],
            },
          },
        ]
      : [],
  };
}

function getPinImageId(state: State, catType: string, highRate: boolean) {
  return `restaurant-pin-${state}-${catType}-${highRate ? "high" : "normal"}`;
}

function getPinStyle(state: State, catType: string) {
  switch (state) {
    case "closed": {
      return {
        bodyColor: "#1a1614",
        ringColor: "rgba(255,255,255,0.6)",
        glyphColor: "rgba(255,255,255,0.85)",
      };
    }
    case "visited": {
      return {
        bodyColor: catType === "udon" ? "#b88947" : "#b54a3c",
        ringColor: "rgba(255,255,255,0.85)",
        glyphColor: "#faf6ec",
      };
    }
    case "wish": {
      return {
        bodyColor: "#faf6ec",
        ringColor: catType === "udon" ? "#b88947" : "#b54a3c",
        glyphColor: catType === "udon" ? "#8c6332" : "#8c2e21",
      };
    }
  }
}

function createPinImage(
  state: State,
  catType: string,
  highRate: boolean,
  glyphImage: HTMLImageElement,
) {
  const canvas = document.createElement("canvas");
  canvas.width = PIN_IMAGE_WIDTH * PIN_IMAGE_PIXEL_RATIO;
  canvas.height = PIN_IMAGE_HEIGHT * PIN_IMAGE_PIXEL_RATIO;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create marker image");
  }

  ctx.scale(PIN_IMAGE_PIXEL_RATIO, PIN_IMAGE_PIXEL_RATIO);
  drawPinImage(ctx, state, catType, highRate, glyphImage);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function createDraftPinImage() {
  const canvas = document.createElement("canvas");
  canvas.width = PIN_IMAGE_WIDTH * PIN_IMAGE_PIXEL_RATIO;
  canvas.height = PIN_IMAGE_HEIGHT * PIN_IMAGE_PIXEL_RATIO;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create draft marker image");
  }

  ctx.scale(PIN_IMAGE_PIXEL_RATIO, PIN_IMAGE_PIXEL_RATIO);
  const x = PIN_IMAGE_WIDTH / 2;
  const top = 2;

  ctx.save();
  ctx.shadowColor = "rgba(26, 22, 20, 0.32)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(x, top + 1);
  ctx.bezierCurveTo(x - 10, top + 1, x - 17, top + 8, x - 17, top + 16);
  ctx.bezierCurveTo(x - 17, top + 25, x, top + 43, x, top + 43);
  ctx.bezierCurveTo(x, top + 43, x + 17, top + 25, x + 17, top + 16);
  ctx.bezierCurveTo(x + 17, top + 8, x + 10, top + 1, x, top + 1);
  ctx.closePath();
  ctx.fillStyle = "#b54a3c";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#fffaf0";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ctx.strokeStyle = "#fffaf0";
  ctx.lineWidth = 2.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, top + 11);
  ctx.lineTo(x, top + 25);
  ctx.moveTo(x - 7, top + 18);
  ctx.lineTo(x + 7, top + 18);
  ctx.stroke();
  ctx.restore();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function drawPinImage(
  ctx: CanvasRenderingContext2D,
  state: State,
  catType: string,
  highRate: boolean,
  glyphImage: HTMLImageElement | null,
) {
  const { bodyColor, ringColor, glyphColor } = getPinStyle(state, catType);
  const x = PIN_IMAGE_WIDTH / 2;
  const top = 4;

  ctx.save();
  ctx.shadowColor = "rgba(26, 22, 20, 0.28)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(x, top + 1);
  ctx.bezierCurveTo(x - 9, top + 1, x - 15, top + 7, x - 15, top + 14);
  ctx.bezierCurveTo(x - 15, top + 22, x, top + 37, x, top + 37);
  ctx.bezierCurveTo(x, top + 37, x + 15, top + 22, x + 15, top + 14);
  ctx.bezierCurveTo(x + 15, top + 7, x + 9, top + 1, x, top + 1);
  ctx.closePath();
  ctx.fillStyle = bodyColor;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  ctx.strokeStyle = glyphColor;
  ctx.fillStyle = glyphColor;
  ctx.lineWidth = 1.55;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (state === "closed") {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 5, top + 13);
    ctx.lineTo(x + 5, top + 23);
    ctx.moveTo(x + 5, top + 13);
    ctx.lineTo(x - 5, top + 23);
    ctx.stroke();
  } else if (glyphImage) {
    ctx.drawImage(
      glyphImage,
      x - GLYPH_SIZE / 2,
      top + 5,
      GLYPH_SIZE,
      GLYPH_SIZE,
    );
  }

  if (state === "visited" && highRate) {
    ctx.beginPath();
    ctx.arc(x + 10, top + 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#f6b552";
    ctx.fill();
    ctx.strokeStyle = "#fffaf0";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

const GLYPH_SIZE = 20;

function buildGlyphSvg(catType: "ramen" | "udon", color: string): string {
  const sw = 1.6;
  if (catType === "udon") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="3 2 18 16" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
<path d="M3.5 11 H20.5 A8.5 5 0 0 1 3.5 11 Z" fill="${color}" fill-opacity="0.14"/>
<path d="M3.5 11 H20.5"/>
<path d="M6 8.4 Q9 6.6 12 8.4 T18 8.4"/>
<path d="M5.5 6.4 Q9 4.6 12.5 6.4 T18.5 6.4"/>
<path d="M2 14 H22" stroke-width="${sw * 0.75}" opacity="0.55"/>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
<path d="M4 5 L20 1.5" stroke-width="${sw * 0.95}"/>
<path d="M4 7.5 L20 4" stroke-width="${sw * 0.95}"/>
<path d="M8.5 5.2 C7 8.2 9.5 11.5 8 14.5" stroke-width="${sw * 0.85}"/>
<path d="M12 4.5 C10.5 7.5 13 11 11.5 14" stroke-width="${sw * 0.85}"/>
<path d="M15.5 3.8 C14 7.5 16.5 11 15 14" stroke-width="${sw * 0.85}"/>
<path d="M2 15 C2 21 7 23 12 23 C17 23 22 21 22 15 Z" fill="${color}" fill-opacity="0.16"/>
<path d="M2 15 H22" stroke-width="${sw * 1.05}"/>
<g stroke-width="${sw * 0.75}" stroke-linecap="square" stroke-linejoin="miter">
<path d="M4.4 18.5 h1.7 v1.8 h1.7"/>
<path d="M10.3 18.5 h1.7 v1.8 h1.7"/>
<path d="M16.2 18.5 h1.7 v1.8 h1.7"/>
</g>
</svg>`;
}

async function loadGlyphImage(svg: string): Promise<HTMLImageElement> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new globalThis.Image();
  img.src = url;
  await img.decode();
  return img;
}

async function ensurePinImages(map: MapLibreMap) {
  const glyphs: Record<string, HTMLImageElement> = {};

  await Promise.all(
    (["visited", "wish"] as const).flatMap((state) =>
      (["ramen", "udon"] as const).map(async (catType) => {
        const { glyphColor } = getPinStyle(state, catType);
        const key = `${catType}:${glyphColor}`;
        if (key in glyphs) {
          return;
        }
        glyphs[key] = await loadGlyphImage(buildGlyphSvg(catType, glyphColor));
      }),
    ),
  );

  for (const state of ["closed", "visited", "wish"] as const) {
    for (const catType of ["ramen", "udon"]) {
      for (const highRate of [false, true]) {
        const id = getPinImageId(state, catType, highRate);
        if (map.hasImage(id)) {
          continue;
        }
        const { glyphColor } = getPinStyle(state, catType);
        const glyphImage = glyphs[`${catType}:${glyphColor}`] ?? null;
        map.addImage(id, createPinImage(state, catType, highRate, glyphImage), {
          pixelRatio: PIN_IMAGE_PIXEL_RATIO,
        });
      }
    }
  }

  if (!map.hasImage(DRAFT_IMAGE_ID)) {
    map.addImage(DRAFT_IMAGE_ID, createDraftPinImage(), {
      pixelRatio: PIN_IMAGE_PIXEL_RATIO,
    });
  }
}

function createMapHandle(
  map: MapLibreMap,
  pendingProgrammaticMoveEndsRef: React.RefObject<number>,
): MapHandle {
  const startProgrammaticMove = () => {
    pendingProgrammaticMoveEndsRef.current += 1;
  };

  return {
    getCenter: () => {
      const center = map.getCenter();
      return { lat: center.lat, lng: center.lng };
    },
    flyTo: (center) => {
      startProgrammaticMove();
      map.flyTo({ center: toLngLat(center), essential: true });
    },
    panTo: (center, options) => {
      startProgrammaticMove();
      if (options?.animate === false) {
        map.jumpTo({ center: toLngLat(center) });
        return;
      }

      map.easeTo({
        center: toLngLat(center),
        duration: options?.duration ?? DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
    },
  };
}

function createPendingMapHandle(
  mapRef: React.RefObject<MapLibreMap | null>,
  fallbackCenterRef: React.RefObject<[number, number] | undefined>,
  pendingProgrammaticMoveEndsRef: React.RefObject<number>,
): MapHandle {
  const getFallbackCenter = () => fallbackCenterRef.current ?? DEFAULT_CENTER;

  return {
    getCenter: () => {
      const map = mapRef.current;
      if (map) {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      }

      const center = getFallbackCenter();
      return { lat: center[0], lng: center[1] };
    },
    flyTo: (center) => {
      pendingProgrammaticMoveEndsRef.current += 1;
      mapRef.current?.flyTo({ center: toLngLat(center), essential: true });
    },
    panTo: (center, options) => {
      pendingProgrammaticMoveEndsRef.current += 1;
      if (options?.animate === false) {
        mapRef.current?.jumpTo({ center: toLngLat(center) });
        return;
      }

      mapRef.current?.easeTo({
        center: toLngLat(center),
        duration: options?.duration ?? DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
    },
  };
}

function addRestaurantLayers(map: MapLibreMap) {
  map.addLayer({
    id: RESTAURANT_SELECTED_LAYER_ID,
    type: "circle",
    source: RESTAURANTS_SOURCE_ID,
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": "rgba(181,74,60,0.18)",
      "circle-radius": 23,
      "circle-stroke-color": "#f6b552",
      "circle-stroke-width": 3,
      "circle-translate": [0, -20],
    },
  });

  map.addLayer({
    id: RESTAURANT_PINS_LAYER_ID,
    type: "symbol",
    source: RESTAURANTS_SOURCE_ID,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: RESTAURANT_LABELS_LAYER_ID,
    type: "symbol",
    source: RESTAURANTS_SOURCE_ID,
    layout: {
      "text-field": [
        "step",
        ["zoom"],
        "",
        9,
        [
          "case",
          [">", ["to-number", ["get", "nearestKm"], 0], 4.8],
          ["get", "name"],
          "",
        ],
        10,
        [
          "case",
          [">", ["to-number", ["get", "nearestKm"], 0], 1.6],
          ["get", "name"],
          "",
        ],
        11,
        [
          "case",
          [">", ["to-number", ["get", "nearestKm"], 0], 0.8],
          ["get", "name"],
          "",
        ],
        13,
        [
          "case",
          [">", ["to-number", ["get", "nearestKm"], 0], 0.4],
          ["get", "name"],
          "",
        ],
        14,
        ["get", "name"],
      ],
      "text-font": ["Klokantech Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "right",
      "text-offset": [-1.5, -2],
      "text-max-width": 8,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "state"], "closed"],
        "#1a1614",
        ["==", ["get", "catType"], "udon"],
        "#b88947",
        "#b54a3c",
      ],
      "text-halo-color": "rgba(255,255,255,0.92)",
      "text-halo-width": 1.5,
    },
  });
}

function addDraftLayer(map: MapLibreMap) {
  map.addLayer({
    id: DRAFT_LAYER_ID,
    type: "symbol",
    source: DRAFT_SOURCE_ID,
    layout: {
      "icon-image": DRAFT_IMAGE_ID,
      "icon-anchor": "bottom",
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

export const Map = memo(
  forwardRef<MapHandle, Props>(function Map(
    {
      center,
      categories,
      restaurants,
      selectedId,
      onSelect,
      onMoveEnd,
      initialZoom = 13,
      onMapClick,
      draftLatLng,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const handleRef = useRef<MapHandle | null>(null);
    const pendingHandleRef = useRef<MapHandle | null>(null);
    const pendingProgrammaticMoveEndsRef = useRef(0);
    const initialCenterRef = useRef(center);
    const initialZoomRef = useRef(initialZoom);

    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onMoveEndRef = useRef(onMoveEnd);
    onMoveEndRef.current = onMoveEnd;
    const onMapClickRef = useRef(onMapClick);
    onMapClickRef.current = onMapClick;
    const geoJsonData = useMemo(() => {
      return toGeoJson(restaurants, categories);
    }, [categories, restaurants]);
    const dataRef = useRef(geoJsonData);
    dataRef.current = geoJsonData;
    const draftGeoJsonData = useMemo(() => {
      return toDraftGeoJson(draftLatLng ?? null);
    }, [draftLatLng]);
    const draftDataRef = useRef(draftGeoJsonData);
    draftDataRef.current = draftGeoJsonData;

    if (!pendingHandleRef.current) {
      pendingHandleRef.current = createPendingMapHandle(
        mapRef,
        initialCenterRef,
        pendingProgrammaticMoveEndsRef,
      );
    }

    useImperativeHandle(
      ref,
      () => handleRef.current ?? pendingHandleRef.current!,
    );

    useEffect(() => {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: toLngLat(
          (initialCenterRef.current ?? DEFAULT_CENTER) as [number, number],
        ),
        zoom: initialZoomRef.current,
        maxZoom: 19,
        dragRotate: false,
        refreshExpiredTiles: false,
        attributionControl: false,
        maxTileCacheSize: 1024,
        fadeDuration: 0,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
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
        },
      });

      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      handleRef.current = createMapHandle(map, pendingProgrammaticMoveEndsRef);

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left",
      );
      containerRef.current
        .querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");

      const handleMoveEnd = () => {
        if (handleRef.current) {
          if (pendingProgrammaticMoveEndsRef.current > 0) {
            pendingProgrammaticMoveEndsRef.current -= 1;
            onMoveEndRef.current(handleRef.current, "programmatic");
            return;
          }

          onMoveEndRef.current(handleRef.current, "user");
        }
      };

      const handleRestaurantClick = (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") {
          onSelectRef.current(id);
        }
      };

      const handleMapClick = (e: maplibregl.MapMouseEvent) => {
        const handler = onMapClickRef.current;
        if (!handler) {
          return;
        }
        handler({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      };

      const setPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const resetPointer = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("load", () => {
        void ensurePinImages(map).then(() => {
          map.addSource(RESTAURANTS_SOURCE_ID, {
            type: "geojson",
            data: dataRef.current,
          });
          map.addSource(DRAFT_SOURCE_ID, {
            type: "geojson",
            data: draftDataRef.current,
          });
          addRestaurantLayers(map);
          addDraftLayer(map);
          map.on("click", RESTAURANT_PINS_LAYER_ID, handleRestaurantClick);
          map.on("mouseenter", RESTAURANT_PINS_LAYER_ID, setPointer);
          map.on("mouseleave", RESTAURANT_PINS_LAYER_ID, resetPointer);
        });
      });
      map.on("moveend", handleMoveEnd);
      map.on("click", handleMapClick);

      return () => {
        map.off("moveend", handleMoveEnd);
        map.off("click", handleMapClick);
        map.remove();
        mapRef.current = null;
        handleRef.current = null;
      };
    }, []);

    useEffect(() => {
      const source = mapRef.current?.getSource(RESTAURANTS_SOURCE_ID);
      if (source instanceof GeoJSONSource) {
        source.setData(dataRef.current);
      }
    }, [categories, restaurants]);

    useEffect(() => {
      const source = mapRef.current?.getSource(DRAFT_SOURCE_ID);
      if (source instanceof GeoJSONSource) {
        source.setData(draftDataRef.current);
      }
    }, [draftLatLng]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map?.getLayer(RESTAURANT_SELECTED_LAYER_ID)) {
        return;
      }

      map.setFilter(RESTAURANT_SELECTED_LAYER_ID, [
        "==",
        ["get", "id"],
        selectedId ?? "",
      ]);
    }, [selectedId]);

    return <div ref={containerRef} className="nm-maplibre" />;
  }),
);

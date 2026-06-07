import { createBasemapStyle } from "@/features/map/basemap-style.ts";
import {
  appendDragInertiaSample,
  DRAG_PAN_INERTIA_OPTIONS,
  DragGlideState,
  glideAfterDrag,
  INTERRUPTED_GLIDE_MOVEEND_DELAY_MS,
} from "@/features/map/drag-inertia.ts";
import { initializeMapLibreRuntime } from "@/features/map/pmtiles-protocol.ts";
import { Shop } from "@/features/shops/api/use-shops.ts";
import { useIsPc } from "@/utils/use-is-pc.ts";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  Dispatch,
  forwardRef,
  memo,
  SetStateAction,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGeolocated } from "react-geolocated";
import "./map.css";

export interface MapHandle {
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  flyTo: (center: [number, number]) => void;
  panTo: (
    center: [number, number],
    options?: { animate?: boolean; duration?: number },
  ) => void;
  syncToUserLocation: (
    location: UserLocation,
    options?: { animate?: boolean; duration?: number },
  ) => void;
  requestUserLocationTracking: () => boolean;
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export type LocationTrackingMode = "off" | "follow";

export interface MapEventHandler {
  (map: MapHandle, source: "user" | "programmatic"): void;
}

export type MapSelectSource = "map" | "external";

export interface MapSelectDetails {
  source: MapSelectSource;
  latlng?: [number, number];
}

interface Props {
  initialCenter: [number, number];
  shops: Shop[];
  selectedId: string | null;
  onSelect: (id: string, details: MapSelectDetails) => void;
  onMoveEnd: MapEventHandler;
  initialZoom?: number;
  onMapClick?: (latlng: { lat: number; lng: number }) => void;
  draftLatLng?: { lat: number; lng: number } | null;
  onLocationTrackingModeChange?: (mode: LocationTrackingMode) => void;
}

type State = "eaten" | "wish" | "closed";

const SHOPS_SOURCE_ID = "shops";
const SHOP_PINS_LAYER_ID = "shop-pins";
const SHOP_LABELS_LAYER_ID = "shop-labels";
const SHOP_SELECTED_LAYER_ID = "shop-selected";
const DRAFT_SOURCE_ID = "draft-shop";
const DRAFT_LAYER_ID = "draft-shop-pin";
const DRAFT_IMAGE_ID = "draft-shop-pin-image";
const USER_LOCATION_SOURCE_ID = "user-location";
const USER_LOCATION_HALO_LAYER_ID = "user-location-halo";
const USER_LOCATION_DOT_LAYER_ID = "user-location-dot";
const PIN_IMAGE_PIXEL_RATIO = 2;
const PIN_IMAGE_WIDTH = 38;
const PIN_IMAGE_HEIGHT = 46;
const DEFAULT_PAN_DURATION_MS = 450;

function toLngLat(center: [number, number]): [number, number] {
  return [center[1], center[0]];
}

function buildNearestKmMap(shops: Shop[]): Map<string, number> {
  const result = new globalThis.Map<string, number>();
  for (const r of shops) {
    let minSq = Infinity;
    for (const o of shops) {
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

function toGeoJson(shops: Shop[]) {
  const nearestKmMap = buildNearestKmMap(shops);
  return {
    type: "FeatureCollection" as const,
    features: shops.map((r) => {
      const isEaten = r.eaten;
      const isClosed = r.closed;
      const highRate = isEaten && (r.rate ?? 0) >= 80;
      const nearestKm = nearestKmMap.get(r.id) ?? 99;

      return {
        type: "Feature" as const,
        id: r.id,
        properties: {
          id: r.id,
          name: r.name,
          nearestKm,
          catType: r.category,
          state: isClosed ? "closed" : isEaten ? "eaten" : "wish",
          highRate,
          icon: getPinImageId(
            isClosed ? "closed" : isEaten ? "eaten" : "wish",
            r.category,
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

function toUserLocationGeoJson(userLocation: UserLocation | null) {
  return {
    type: "FeatureCollection" as const,
    features: userLocation
      ? [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Point" as const,
              coordinates: [userLocation.lng, userLocation.lat],
            },
          },
        ]
      : [],
  };
}

function getPinImageId(state: State, catType: string, highRate: boolean) {
  return `shop-pin-${state}-${catType}-${highRate ? "high" : "normal"}`;
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
    case "eaten": {
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
  glyphImage: HTMLImageElement | null,
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

  if (state === "eaten" && highRate) {
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
    (["eaten", "wish"] as const).flatMap((state) =>
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

  for (const state of ["closed", "eaten", "wish"] as const) {
    for (const catType of ["ramen", "udon"]) {
      for (const highRate of [false, true]) {
        const id = getPinImageId(state, catType, highRate);
        const { glyphColor } = getPinStyle(state, catType);
        const glyphImage = glyphs[`${catType}:${glyphColor}`] ?? null;
        const image = createPinImage(state, catType, highRate, glyphImage);
        if (map.hasImage(id)) {
          map.updateImage(id, image);
        } else {
          map.addImage(id, image, {
            pixelRatio: PIN_IMAGE_PIXEL_RATIO,
          });
        }
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
  userLocationRef: React.RefObject<UserLocation | null>,
  setLocationTrackingMode: Dispatch<SetStateAction<LocationTrackingMode>>,
): MapHandle {
  const startProgrammaticMove = () => {
    pendingProgrammaticMoveEndsRef.current += 1;
  };

  return {
    getCenter: () => {
      const center = map.getCenter();
      return { lat: center.lat, lng: center.lng };
    },
    getZoom: () => map.getZoom(),
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
    syncToUserLocation: (location, options) => {
      startProgrammaticMove();
      const center = toLngLat([location.lat, location.lng]);
      if (options?.animate === false) {
        map.jumpTo({ center });
        return;
      }

      map.easeTo({
        center,
        duration: options?.duration ?? DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
    },
    requestUserLocationTracking: () => {
      const location = userLocationRef.current;
      if (!location) {
        return false;
      }

      setLocationTrackingMode("follow");
      startProgrammaticMove();
      map.easeTo({
        center: toLngLat([location.lat, location.lng]),
        duration: DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      return true;
    },
  };
}

function createPendingMapHandle(
  mapRef: React.RefObject<MapLibreMap | null>,
  fallbackCenterRef: React.RefObject<[number, number]>,
  pendingProgrammaticMoveEndsRef: React.RefObject<number>,
  userLocationRef: React.RefObject<UserLocation | null>,
  setLocationTrackingMode: Dispatch<SetStateAction<LocationTrackingMode>>,
): MapHandle {
  return {
    getCenter: () => {
      const map = mapRef.current;
      if (map) {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      }

      const center = fallbackCenterRef.current;
      return { lat: center[0], lng: center[1] };
    },
    getZoom: () => mapRef.current?.getZoom() ?? 13,
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
    syncToUserLocation: (location, options) => {
      pendingProgrammaticMoveEndsRef.current += 1;
      const center = toLngLat([location.lat, location.lng]);
      if (options?.animate === false) {
        mapRef.current?.jumpTo({ center });
        return;
      }

      mapRef.current?.easeTo({
        center,
        duration: options?.duration ?? DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
    },
    requestUserLocationTracking: () => {
      const location = userLocationRef.current;
      const map = mapRef.current;
      if (!location || !map) {
        return false;
      }

      setLocationTrackingMode("follow");
      pendingProgrammaticMoveEndsRef.current += 1;
      map.easeTo({
        center: toLngLat([location.lat, location.lng]),
        duration: DEFAULT_PAN_DURATION_MS,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      return true;
    },
  };
}

function addShopLayers(map: MapLibreMap) {
  map.addLayer({
    id: SHOP_SELECTED_LAYER_ID,
    type: "circle",
    source: SHOPS_SOURCE_ID,
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
    id: SHOP_PINS_LAYER_ID,
    type: "symbol",
    source: SHOPS_SOURCE_ID,
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
      "icon-size": 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  map.addLayer({
    id: SHOP_LABELS_LAYER_ID,
    type: "symbol",
    source: SHOPS_SOURCE_ID,
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
      "text-font": ["Noto Sans Regular"],
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

function addUserLocationLayers(map: MapLibreMap) {
  map.addLayer({
    id: USER_LOCATION_HALO_LAYER_ID,
    type: "circle",
    source: USER_LOCATION_SOURCE_ID,
    paint: {
      "circle-color": "rgba(26, 115, 232, 0.18)",
      "circle-radius": 17,
      "circle-stroke-color": "rgba(255,255,255,0.75)",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: USER_LOCATION_DOT_LAYER_ID,
    type: "circle",
    source: USER_LOCATION_SOURCE_ID,
    paint: {
      "circle-color": "#1a73e8",
      "circle-radius": 8,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 3,
    },
  });
}

export const Map = memo(
  forwardRef<MapHandle, Props>(function Map(
    {
      initialCenter,
      shops,
      selectedId,
      onSelect,
      onMoveEnd,
      initialZoom = 13,
      onMapClick,
      draftLatLng,
      onLocationTrackingModeChange,
    },
    ref,
  ) {
    const isPc = useIsPc();
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const handleRef = useRef<MapHandle | null>(null);
    const pendingHandleRef = useRef<MapHandle | null>(null);
    const pendingProgrammaticMoveEndsRef = useRef(0);
    const initialCenterRef = useRef(initialCenter);
    const initialZoomRef = useRef(initialZoom);
    const dragGlideStateRef = useRef<DragGlideState>({ type: "idle" });
    const interruptedGlideMoveEndTimerRef = useRef<number | null>(null);
    const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
    const userLocationRef = useRef<UserLocation | null>(null);
    const [locationTrackingMode, setLocationTrackingMode] =
      useState<LocationTrackingMode>("off");
    const { coords } = useGeolocated({
      watchPosition: true,
      watchLocationPermissionChange: true,
    });

    const onSelectEvent = useEffectEvent(
      (id: string, details: MapSelectDetails) => {
        onSelect(id, details);
      },
    );
    const onMoveEndEvent = useEffectEvent(
      (map: MapHandle, source: "user" | "programmatic") => {
        onMoveEnd(map, source);
      },
    );
    const onMapClickEvent = useEffectEvent(
      (latlng: { lat: number; lng: number }) => {
        onMapClick?.(latlng);
      },
    );
    const onLocationTrackingModeChangeEvent = useEffectEvent(
      (mode: LocationTrackingMode) => {
        onLocationTrackingModeChange?.(mode);
      },
    );
    const geoJsonData = useMemo(() => {
      return toGeoJson(shops);
    }, [shops]);
    const dataRef = useRef(geoJsonData);
    dataRef.current = geoJsonData;
    const draftGeoJsonData = useMemo(() => {
      return toDraftGeoJson(draftLatLng ?? null);
    }, [draftLatLng]);
    const draftDataRef = useRef(draftGeoJsonData);
    draftDataRef.current = draftGeoJsonData;
    const userLocationGeoJsonData = useMemo(() => {
      return toUserLocationGeoJson(userLocation ?? null);
    }, [userLocation]);
    const userLocationDataRef = useRef(userLocationGeoJsonData);
    userLocationDataRef.current = userLocationGeoJsonData;

    if (!pendingHandleRef.current) {
      pendingHandleRef.current = createPendingMapHandle(
        mapRef,
        initialCenterRef,
        pendingProgrammaticMoveEndsRef,
        userLocationRef,
        setLocationTrackingMode,
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

      initializeMapLibreRuntime();

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: toLngLat(initialCenterRef.current),
        zoom: initialZoomRef.current,
        maxZoom: 19,
        dragPan: DRAG_PAN_INERTIA_OPTIONS,
        dragRotate: false,
        refreshExpiredTiles: false,
        attributionControl: false,
        maxTileCacheSize: 1024,
        fadeDuration: 0,
        style: createBasemapStyle(),
      });

      map.dragPan.enable(DRAG_PAN_INERTIA_OPTIONS);
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      handleRef.current = createMapHandle(
        map,
        pendingProgrammaticMoveEndsRef,
        userLocationRef,
        setLocationTrackingMode,
      );

      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        isPc ? "bottom-right" : "bottom-left",
      );
      containerRef.current
        .querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show");

      const clearInterruptedGlideMoveEndTimer = () => {
        if (interruptedGlideMoveEndTimerRef.current === null) {
          return;
        }

        window.clearTimeout(interruptedGlideMoveEndTimerRef.current);
        interruptedGlideMoveEndTimerRef.current = null;
      };

      const scheduleInterruptedGlideMoveEnd = () => {
        clearInterruptedGlideMoveEndTimer();
        interruptedGlideMoveEndTimerRef.current = window.setTimeout(() => {
          interruptedGlideMoveEndTimerRef.current = null;
          if (
            !handleRef.current ||
            dragGlideStateRef.current.type !== "interrupted-glide"
          ) {
            return;
          }

          dragGlideStateRef.current = { type: "idle" };
          onMoveEndEvent(handleRef.current, "user");
        }, INTERRUPTED_GLIDE_MOVEEND_DELAY_MS);
      };

      const handleMoveEnd = () => {
        if (!handleRef.current) {
          return;
        }

        if (pendingProgrammaticMoveEndsRef.current > 0) {
          pendingProgrammaticMoveEndsRef.current -= 1;
          onMoveEndEvent(handleRef.current, "programmatic");
          return;
        }

        const dragGlideState = dragGlideStateRef.current;
        if (dragGlideState.type === "pending-glide") {
          const startedGlide = glideAfterDrag(map, dragGlideState.samples);
          if (startedGlide) {
            dragGlideStateRef.current = { type: "gliding" };
            return;
          }

          dragGlideStateRef.current = { type: "idle" };
        }

        if (dragGlideState.type === "gliding") {
          dragGlideStateRef.current = { type: "idle" };
        } else if (dragGlideState.type === "interrupted-glide") {
          scheduleInterruptedGlideMoveEnd();
          return;
        }

        setLocationTrackingMode("off");
        onMoveEndEvent(handleRef.current, "user");
      };

      const handleShopClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") {
          let latlng: [number, number] | undefined;
          if (feature?.geometry.type === "Point") {
            const [lng, lat] = feature.geometry.coordinates;
            latlng = [lat, lng];
          }

          onSelectEvent(id, { source: "map", latlng });
        }
      };

      const handleMapClick = (e: maplibregl.MapMouseEvent) => {
        onMapClickEvent({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      };

      const setPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const resetPointer = () => {
        map.getCanvas().style.cursor = "";
      };
      const handlePointerDown = () => {
        clearInterruptedGlideMoveEndTimer();
        if (dragGlideStateRef.current.type === "gliding") {
          dragGlideStateRef.current = { type: "interrupted-glide" };
        }
      };
      const handleDragStart = () => {
        clearInterruptedGlideMoveEndTimer();
        dragGlideStateRef.current = {
          type: "dragging",
          samples: appendDragInertiaSample(map, []),
        };
      };
      const handleDrag = () => {
        const dragGlideState = dragGlideStateRef.current;
        if (dragGlideState.type !== "dragging") {
          return;
        }

        dragGlideStateRef.current = {
          type: "dragging",
          samples: appendDragInertiaSample(map, dragGlideState.samples),
        };
      };
      const handleDragEnd = () => {
        const dragGlideState = dragGlideStateRef.current;
        if (dragGlideState.type !== "dragging") {
          return;
        }

        dragGlideStateRef.current = {
          type: "pending-glide",
          samples: appendDragInertiaSample(map, dragGlideState.samples),
        };
      };

      map.on("load", () => {
        void ensurePinImages(map).then(() => {
          map.addSource(SHOPS_SOURCE_ID, {
            type: "geojson",
            data: dataRef.current,
          });
          map.addSource(DRAFT_SOURCE_ID, {
            type: "geojson",
            data: draftDataRef.current,
          });
          map.addSource(USER_LOCATION_SOURCE_ID, {
            type: "geojson",
            data: userLocationDataRef.current,
          });
          addShopLayers(map);
          addDraftLayer(map);
          addUserLocationLayers(map);
          map.on("click", SHOP_PINS_LAYER_ID, handleShopClick);
          map.on("mouseenter", SHOP_PINS_LAYER_ID, setPointer);
          map.on("mouseleave", SHOP_PINS_LAYER_ID, resetPointer);
        });
      });

      map.on("moveend", handleMoveEnd);
      map.on("click", handleMapClick);
      map.on("dragstart", handleDragStart);
      map.on("drag", handleDrag);
      map.on("dragend", handleDragEnd);
      map.getCanvas().addEventListener("pointerdown", handlePointerDown, {
        passive: true,
      });

      return () => {
        clearInterruptedGlideMoveEndTimer();
        map.off("click", SHOP_PINS_LAYER_ID, handleShopClick);
        map.off("mouseenter", SHOP_PINS_LAYER_ID, setPointer);
        map.off("mouseleave", SHOP_PINS_LAYER_ID, resetPointer);
        map.off("moveend", handleMoveEnd);
        map.off("click", handleMapClick);
        map.off("dragstart", handleDragStart);
        map.off("drag", handleDrag);
        map.off("dragend", handleDragEnd);
        map.getCanvas().removeEventListener("pointerdown", handlePointerDown);
        map.remove();
        mapRef.current = null;
        handleRef.current = null;
      };
    }, [isPc]);

    useEffect(() => {
      if (!coords) {
        return;
      }

      setUserLocation({
        lat: coords.latitude,
        lng: coords.longitude,
      });
    }, [coords]);

    useEffect(() => {
      const source = mapRef.current?.getSource(SHOPS_SOURCE_ID);
      if (source instanceof GeoJSONSource) {
        source.setData(geoJsonData);
      }
    }, [geoJsonData]);

    useEffect(() => {
      const source = mapRef.current?.getSource(DRAFT_SOURCE_ID);
      if (source instanceof GeoJSONSource) {
        source.setData(draftGeoJsonData);
      }
    }, [draftGeoJsonData]);

    useEffect(() => {
      const source = mapRef.current?.getSource(USER_LOCATION_SOURCE_ID);
      if (source instanceof GeoJSONSource) {
        source.setData(userLocationGeoJsonData);
      }
    }, [userLocationGeoJsonData]);

    useEffect(() => {
      userLocationRef.current = userLocation;
      if (locationTrackingMode === "off" || !userLocation) {
        return;
      }

      handleRef.current?.syncToUserLocation(userLocation, {
        animate: false,
      });
    }, [locationTrackingMode, userLocation]);

    useEffect(() => {
      onLocationTrackingModeChangeEvent(locationTrackingMode);
    }, [locationTrackingMode]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map?.getLayer(SHOP_SELECTED_LAYER_ID)) {
        return;
      }

      map.setFilter(SHOP_SELECTED_LAYER_ID, [
        "==",
        ["get", "id"],
        selectedId ?? "",
      ]);
    }, [selectedId]);

    return <div ref={containerRef} className="nm-maplibre" />;
  }),
);

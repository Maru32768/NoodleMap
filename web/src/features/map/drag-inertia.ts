import { DragPanOptions, Map as MapLibreMap } from "maplibre-gl";

export type DragInertiaSample = {
  center: { lat: number; lng: number };
  time: number;
};

export type DragGlideState =
  | { type: "idle" }
  | { type: "dragging"; samples: DragInertiaSample[] }
  | { type: "pending-glide"; samples: DragInertiaSample[] }
  | { type: "gliding" }
  | { type: "interrupted-glide" };

const DRAG_INERTIA_SAMPLE_WINDOW_MS = 140;
const DRAG_INERTIA_MIN_PIXEL_DISTANCE = 26;
const DRAG_INERTIA_MIN_PIXEL_SPEED = 0.85;
const DRAG_INERTIA_EXTRA_PIXEL_FACTOR = 330;
const DRAG_INERTIA_MAX_EXTRA_PIXELS = 420;

export const INTERRUPTED_GLIDE_MOVEEND_DELAY_MS = 220;
export const DRAG_PAN_INERTIA_OPTIONS: DragPanOptions = {
  linearity: 0.01,
  maxSpeed: 1,
  deceleration: 10000,
  easing: easeOutCubic,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function appendDragInertiaSample(
  map: MapLibreMap,
  samples: DragInertiaSample[],
) {
  const center = map.getCenter();
  const now = performance.now();
  const nextSamples = [
    ...samples,
    {
      center: { lat: center.lat, lng: center.lng },
      time: now,
    },
  ];

  return nextSamples.filter((sample, i) => {
    return (
      i >= nextSamples.length - 2 ||
      now - sample.time <= DRAG_INERTIA_SAMPLE_WINDOW_MS
    );
  });
}

export function glideAfterDrag(map: MapLibreMap, samples: DragInertiaSample[]) {
  if (samples.length < 2) {
    return false;
  }

  const from = samples[0];
  const to = samples.at(-1)!;
  const elapsedMs = Math.max(to.time - from.time, 1);
  const fromPoint = map.project([from.center.lng, from.center.lat]);
  const toPoint = map.project([to.center.lng, to.center.lat]);
  const pixelDistance = fromPoint.dist(toPoint);
  const pixelSpeed = pixelDistance / elapsedMs;

  if (
    pixelDistance < DRAG_INERTIA_MIN_PIXEL_DISTANCE ||
    pixelSpeed < DRAG_INERTIA_MIN_PIXEL_SPEED
  ) {
    return false;
  }

  const extraPixels = clamp(
    (pixelSpeed - DRAG_INERTIA_MIN_PIXEL_SPEED) *
      DRAG_INERTIA_EXTRA_PIXEL_FACTOR,
    0,
    DRAG_INERTIA_MAX_EXTRA_PIXELS,
  );
  const targetPoint = toPoint.add(
    toPoint.sub(fromPoint).unit().mult(extraPixels),
  );
  const targetCenter = map.unproject(targetPoint);

  map.easeTo({
    center: [targetCenter.lng, targetCenter.lat],
    duration: clamp(220 + extraPixels * 0.8, 240, 620),
    easing: easeOutCubic,
    essential: true,
  });

  return true;
}

import {
  appendDragInertiaSample,
  DragInertiaSample,
  glideAfterDrag,
} from "@/features/map/drag-inertia.ts";
import { Map as MapLibreMap, Point } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

// A flat 1 px per 0.001 degree projection stands in for the real map.
const SCALE = 1000;

function fakeMap(center = { lat: 35, lng: 139 }) {
  const easeTo = vi.fn();
  const map = {
    getCenter: () => center,
    project: ([lng, lat]: [number, number]) =>
      new Point(lng * SCALE, lat * SCALE),
    unproject: (point: Point) => ({
      lng: point.x / SCALE,
      lat: point.y / SCALE,
    }),
    easeTo,
  } as unknown as MapLibreMap;
  return { map, easeTo };
}

function sample(lng: number, time: number): DragInertiaSample {
  return { center: { lat: 35, lng }, time };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appendDragInertiaSample", () => {
  it("keeps recent samples and always the last two", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { map } = fakeMap({ lat: 35, lng: 139.3 });

    const samples = appendDragInertiaSample(map, [
      sample(139.0, 500),
      sample(139.1, 600),
      sample(139.2, 900),
    ]);

    expect(samples).toEqual([
      sample(139.2, 900),
      { center: { lat: 35, lng: 139.3 }, time: 1000 },
    ]);
  });

  it("keeps an old sample when it is one of the last two", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { map } = fakeMap();

    expect(appendDragInertiaSample(map, [sample(138, 0)])).toEqual([
      sample(138, 0),
      sample(139, 1000),
    ]);
  });
});

describe("glideAfterDrag", () => {
  it("does not glide without two samples", () => {
    const { map, easeTo } = fakeMap();

    expect(glideAfterDrag(map, [sample(139, 0)])).toBe(false);
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("does not glide after a short drag", () => {
    const { map, easeTo } = fakeMap();

    expect(glideAfterDrag(map, [sample(139, 0), sample(139.01, 5)])).toBe(
      false,
    );
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("does not glide after a slow drag", () => {
    const { map, easeTo } = fakeMap();

    expect(glideAfterDrag(map, [sample(139, 0), sample(139.1, 1000)])).toBe(
      false,
    );
    expect(easeTo).not.toHaveBeenCalled();
  });

  it("continues a fast drag in the same direction", () => {
    const { map, easeTo } = fakeMap();

    expect(glideAfterDrag(map, [sample(139, 0), sample(139.1, 50)])).toBe(true);

    const [{ center, duration }] = easeTo.mock.calls[0];
    const [lng, lat] = center as [number, number];
    expect(lng).toBeGreaterThan(139.1);
    expect(lat).toBeCloseTo(35);
    expect(duration).toBeGreaterThanOrEqual(240);
    expect(duration).toBeLessThanOrEqual(620);
  });
});

import {
  distanceM,
  matchShop,
  MAX_CANDIDATES,
} from "@/features/photo-import/matching.ts";
import type { LatLng } from "@/features/photo-import/photos.ts";
import { makeShop } from "@/test/fixtures.ts";
import { describe, expect, it } from "vitest";

const CENTER: LatLng = { lat: 35.6895, lng: 139.7005 };
// Along a meridian the haversine distance is exactly R * dLat.
const M_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;
const shopAt = (northM: number, name = `${northM} m`) =>
  makeShop({ name, lat: CENTER.lat + northM / M_PER_DEGREE, lng: CENTER.lng });

function match(...shops: ReturnType<typeof shopAt>[]) {
  const m = matchShop(CENTER, shops);
  return {
    kind: m.kind,
    names: "candidates" in m ? m.candidates.map((c) => c.shop.name) : [],
  };
}

describe("matchShop", () => {
  it("auto-picks a shop at 20 m when the runner-up is at 70 m", () => {
    expect(match(shopAt(70), shopAt(20))).toEqual({
      kind: "auto",
      names: ["20 m", "70 m"],
    });
  });

  it("asks when two neighbors are 25 m apart, offering both", () => {
    expect(match(shopAt(10), shopAt(35))).toEqual({
      kind: "ambiguous",
      names: ["10 m", "35 m"],
    });
  });

  it("auto-picks right at each boundary and asks just past it", () => {
    const EPS = 0.01;
    // Distance: the nearest within 50 m.
    expect(match(shopAt(50 - EPS)).kind).toBe("auto");
    expect(match(shopAt(50 + EPS)).kind).toBe("ambiguous");
    // Margin: the runner-up at least 30 m farther (here the ratio is ample).
    expect(match(shopAt(20), shopAt(50 + EPS)).kind).toBe("auto");
    expect(match(shopAt(20), shopAt(50 - EPS)).kind).toBe("ambiguous");
    // Ratio: the runner-up at least twice as far (here the margin is ample).
    expect(match(shopAt(-45), shopAt(90 + EPS)).kind).toBe("auto");
    expect(match(shopAt(-45), shopAt(90 - EPS)).kind).toBe("ambiguous");
  });

  it("offers a closed shop as a candidate", () => {
    const closed = makeShop({
      name: "閉店した店",
      lat: CENTER.lat,
      lng: CENTER.lng,
      closedAt: "2020-01-01",
    });

    expect(match(closed)).toEqual({ kind: "auto", names: ["閉店した店"] });
  });

  it("finds nothing past 200 m, and nothing to find without a location", () => {
    expect(match(shopAt(201))).toEqual({ kind: "far", names: [] });
    expect(matchShop(null, [shopAt(0)])).toEqual({ kind: "no_location" });
  });

  it("offers at most five candidates, nearest first", () => {
    const shops = [90, 10, 70, 30, 50, 110, 130].map((m) => shopAt(m));

    expect(match(...shops).names).toEqual(
      ["10 m", "30 m", "50 m", "70 m", "90 m"].slice(0, MAX_CANDIDATES),
    );
  });
});

describe("distanceM", () => {
  it("measures about 111 km per degree of latitude", () => {
    expect(
      distanceM(CENTER, { lat: CENTER.lat + 1, lng: CENTER.lng }),
    ).toBeCloseTo(M_PER_DEGREE, 3);
  });
});

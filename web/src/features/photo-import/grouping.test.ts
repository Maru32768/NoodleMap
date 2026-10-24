import { groupPhotos } from "@/features/photo-import/grouping.ts";
import type { LatLng, Photo } from "@/features/photo-import/photos.ts";
import { describe, expect, it } from "vitest";

const SHOP: LatLng = { lat: 35.6895, lng: 139.7005 };
// Meters due north of SHOP: one degree of latitude is about 111,195 m.
const north = (m: number): LatLng => ({
  lat: SHOP.lat + m / 111_195,
  lng: SHOP.lng,
});

let nextIndex = 0;
// A photo taken at `jst` ("YYYY-MM-DDTHH:MM" in Japan).
function photo(
  jst: string,
  location: LatLng | null = SHOP,
  index = nextIndex++,
): Photo {
  return {
    index,
    file: new File([], `${index}.jpg`),
    capturedAt: new Date(`${jst}:00+09:00`),
    dateSource: "exif",
    location,
  };
}

const indexes = (photos: readonly Photo[]) => photos.map((p) => p.index);

describe("groupPhotos", () => {
  it("keeps filename dates independent even from nearby EXIF photos", () => {
    const first = {
      ...photo("2019-08-03T00:00", null),
      dateSource: "filename",
    } satisfies Photo;
    const second = {
      ...photo("2019-08-03T00:00", null),
      dateSource: "filename",
    } satisfies Photo;
    const exif = photo("2019-08-03T00:01");
    expect(
      groupPhotos([first, second, exif]).map((g) => indexes(g.photos)),
    ).toEqual([[first.index], [second.index], [exif.index]]);
  });

  it("splits on a gap over 30 minutes and keeps a 29-minute gap together", () => {
    const a = photo("2023-04-01T12:00");
    const b = photo("2023-04-01T12:29");
    const c = photo("2023-04-01T13:00");

    expect(groupPhotos([a, b, c]).map((g) => indexes(g.photos))).toEqual([
      [a.index, b.index],
      [c.index],
    ]);
  });

  it("splits a photo more than 80 m from the group's first located photo", () => {
    const a = photo("2023-04-01T12:00", north(0));
    const b = photo("2023-04-01T12:05", north(79));
    const c = photo("2023-04-01T12:10", north(81));

    const groups = groupPhotos([a, b, c]);

    expect(groups.map((g) => indexes(g.photos))).toEqual([
      [a.index, b.index],
      [c.index],
    ]);
  });

  it("lets an unlocated photo join within 20 minutes and start its own group after that", () => {
    const a = photo("2023-04-01T12:00");
    const indoors = photo("2023-04-01T12:15", null);
    const later = photo("2023-04-01T12:40", null);

    const groups = groupPhotos([a, indoors, later]);

    expect(groups.map((g) => [indexes(g.photos), g.center])).toEqual([
      [[a.index, indoors.index], SHOP],
      [[later.index], null],
    ]);
  });

  it("keeps a visit from 23:50 to 00:10 in one group dated on its first day", () => {
    const a = photo("2023-04-01T23:50");
    const b = photo("2023-04-02T00:10");

    expect(groupPhotos([b, a]).map((g) => [g.day, indexes(g.photos)])).toEqual([
      ["2023-04-01", [a.index, b.index]],
    ]);
  });

  it("orders photos by capture time, then by selection order, and names a group by its first photo", () => {
    const second = photo("2023-04-01T12:00", SHOP, 7);
    const first = photo("2023-04-01T12:00", SHOP, 3);
    const earliest = photo("2023-04-01T11:59", SHOP, 9);

    const [group] = groupPhotos([second, first, earliest]);

    expect(indexes(group.photos)).toEqual([9, 3, 7]);
    expect(group.id).toBe(9);
  });

  it("centers a group on the median of its located photos", () => {
    const groups = groupPhotos([
      photo("2023-04-01T12:00", north(0)),
      photo("2023-04-01T12:01", north(10)),
      photo("2023-04-01T12:02", north(60)),
      photo("2023-04-01T12:03", null),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].center).toEqual(north(10));
  });
});

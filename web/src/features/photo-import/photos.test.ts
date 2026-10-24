import {
  parseExifInstant,
  readPhotos,
} from "@/features/photo-import/photos.ts";
import { japanDate } from "@/features/visits/visit-date.ts";
import { ExifSpec, withExif } from "@/test/exif-jpeg.ts";
import { describe, expect, it } from "vitest";

// SOI + EOI: enough of a JPEG for its EXIF to be read.
const BARE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

const jpeg = (name: string, spec: ExifSpec) =>
  new File([withExif(BARE_JPEG, spec)], name, { type: "image/jpeg" });

// "YYYY:MM:DD HH:MM:SS" of the wall clock in Japan `days` from now.
function japanWallClock(days: number) {
  const day = japanDate(new Date(Date.now() + days * 86_400_000));
  return `${day.replaceAll("-", ":")} 12:00:00`;
}

describe("parseExifInstant", () => {
  it("reads the wall clock in the offset the camera recorded", () => {
    expect(parseExifInstant("2023:04:01 12:34:56", "+09:00")).toEqual(
      new Date("2023-04-01T03:34:56Z"),
    );
    expect(parseExifInstant("2023:04:01 12:34:56", "-07:00")).toEqual(
      new Date("2023-04-01T19:34:56Z"),
    );
  });

  it("reads a clock without an offset as Japan time", () => {
    expect(parseExifInstant("2023:04:01 12:34:56", undefined)).toEqual(
      new Date("2023-04-01T03:34:56Z"),
    );
  });

  it("puts 23:30 and 00:30 in Japan on adjacent days", () => {
    const late = parseExifInstant("2023:04:01 23:30:00", "+09:00")!;
    const early = parseExifInstant("2023:04:02 00:30:00", "+09:00")!;
    expect([japanDate(late), japanDate(early)]).toEqual([
      "2023-04-01",
      "2023-04-02",
    ]);
  });

  it("rejects a clock that is malformed or not a real date", () => {
    for (const value of [
      undefined,
      "",
      "0000:00:00 00:00:00",
      "2023:02:30 12:00:00",
      "2023:04:01 24:00:00",
      "2023-04-01 12:00:00",
      "2023:04:01",
    ]) {
      expect(parseExifInstant(value, "+09:00")).toBeNull();
    }
  });
});

describe("readPhotos", () => {
  it("falls back to a strict real filename date at midnight JST without GPS", async () => {
    const files = [
      jpeg("IMG_5415(1)_2019-08-03.JPG", { gps: { lat: 35, lng: 139 } }),
      jpeg("leap_2020-02-29.jpeg", { dateTimeOriginal: "invalid" }),
      new File([BARE_JPEG], "bare_2019-05-03.jpg", { type: "image/jpeg" }),
    ];
    const { photos, rejected } = await readPhotos(files, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    expect(rejected).toEqual([]);
    expect(
      photos.map((p) => [p.dateSource, japanDate(p.capturedAt), p.location]),
    ).toEqual([
      ["filename", "2019-08-03", null],
      ["filename", "2020-02-29", null],
      ["filename", "2019-05-03", null],
    ]);
    expect(photos[0].capturedAt).toEqual(new Date("2019-08-02T15:00:00Z"));
  });

  it("rejects invalid suffixes, future filename dates and corrupt files", async () => {
    const invalid = [
      "a_2019-02-29.jpg",
      "a_2020-02-30.jpg",
      "a_2019-13-01.jpg",
      "a_2019-08-00.jpg",
      "a_2019-8-03.jpg",
      "a_2019-08-03_extra.jpg",
      "2019-08-03_a.jpg",
      "_2019-08-03.jpg",
    ];
    const futureDay = japanDate(new Date(Date.now() + 2 * 86_400_000));
    const { photos, rejected } = await readPhotos(
      [
        ...invalid.map((name) => jpeg(name, {})),
        jpeg(`future_${futureDay}.jpg`, {}),
        new File([new Uint8Array([1, 2, 3])], "broken_2019-08-03.jpg", {
          type: "image/jpeg",
        }),
      ],
      { signal: new AbortController().signal, onProgress: () => {} },
    );
    expect(photos).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual([
      ...invalid.map(() => "no_capture_time"),
      "future",
      "unreadable",
    ]);
  });

  it("keeps valid EXIF and its GPS authoritative even if its date is future", async () => {
    const { photos, rejected } = await readPhotos(
      [
        jpeg("a_2019-08-03.jpg", {
          dateTimeOriginal: "2020:04:01 12:00:00",
          gps: { lat: 35, lng: 139 },
        }),
        jpeg("b_2019-08-03.jpg", { dateTimeOriginal: japanWallClock(2) }),
      ],
      { signal: new AbortController().signal, onProgress: () => {} },
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      dateSource: "exif",
      location: { lat: 35, lng: 139 },
    });
    expect(japanDate(photos[0].capturedAt)).toBe("2020-04-01");
    expect(rejected.map((r) => r.reason)).toEqual(["future"]);
  });

  it("turns each JPEG into a photo or a rejection with its reason", async () => {
    const located = jpeg("located.jpg", {
      dateTimeOriginal: "2023:04:01 12:34:56",
      offsetTimeOriginal: "+09:00",
      gps: { lat: 35.6895, lng: 139.7005 },
    });
    const southWest = jpeg("south-west.jpg", {
      dateTimeOriginal: "2023:04:01 12:00:00",
      offsetTimeOriginal: "-03:00",
      gps: { lat: -34.6037, lng: -58.3816 },
    });
    const unlocated = jpeg("unlocated.JPG", {
      dateTimeOriginal: "2023:04:01 13:00:00",
    });
    const dateless = jpeg("dateless.jpg", { gps: { lat: 35, lng: 139 } });
    const future = jpeg("future.jpg", { dateTimeOriginal: japanWallClock(2) });
    const tomorrow = jpeg("tomorrow.jpg", {
      dateTimeOriginal: japanWallClock(1),
    });
    const png = new File([BARE_JPEG], "screenshot.png", { type: "image/png" });
    const broken = new File([new Uint8Array([1, 2, 3])], "broken.jpg", {
      type: "image/jpeg",
    });
    const files = [
      located,
      southWest,
      unlocated,
      dateless,
      future,
      tomorrow,
      png,
      broken,
    ];
    const progress: number[] = [];

    const { photos, rejected } = await readPhotos(files, {
      signal: new AbortController().signal,
      onProgress: (done) => progress.push(done),
    });

    expect(
      photos.map((p) => ({
        index: p.index,
        name: p.file.name,
        capturedAt: p.capturedAt,
        lat: p.location?.lat.toFixed(4),
        lng: p.location?.lng.toFixed(4),
      })),
    ).toEqual([
      {
        index: 0,
        name: "located.jpg",
        capturedAt: new Date("2023-04-01T03:34:56Z"),
        lat: "35.6895",
        lng: "139.7005",
      },
      {
        index: 1,
        name: "south-west.jpg",
        capturedAt: new Date("2023-04-01T15:00:00Z"),
        lat: "-34.6037",
        lng: "-58.3816",
      },
      {
        index: 2,
        name: "unlocated.JPG",
        capturedAt: new Date("2023-04-01T04:00:00Z"),
        lat: undefined,
        lng: undefined,
      },
      expect.objectContaining({ index: 5, name: "tomorrow.jpg" }),
    ]);
    expect(rejected.map((r) => [r.file.name, r.reason])).toEqual([
      ["dateless.jpg", "no_capture_time"],
      ["future.jpg", "future"],
      ["screenshot.png", "not_jpeg"],
      ["broken.jpg", "unreadable"],
    ]);
    expect(progress.toSorted((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("stops with the abort reason once aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("closed"));

    await expect(
      readPhotos([jpeg("a.jpg", { dateTimeOriginal: "2023:04:01 12:00:00" })], {
        signal: controller.signal,
        onProgress: () => {},
      }),
    ).rejects.toThrow("closed");
  });
});

import { fileURLToPath } from "node:url";
import type { ExifSpec } from "../../web/src/test/exif-jpeg.ts";

// In Sapporo, far from the Tokyo shops other tests create.
export const NEAR_SHOP = { lat: 43.0621, lng: 141.3544 };
export const DATELESS_SHOP = { lat: 43.07, lng: 141.36 };

/** Copies of visit-image.jpg with the EXIF an iPhone writes; scripts/write-photo-fixtures.ts writes them. */
export const PHOTO_FIXTURES: { name: string; exif: ExifSpec }[] = [
  {
    name: "photo-near-1.jpg",
    exif: { dateTimeOriginal: "2023:05:10 12:00:00", offsetTimeOriginal: "+09:00", gps: NEAR_SHOP },
  },
  {
    name: "photo-near-2.jpg",
    // 5 minutes later, about 3 m away.
    exif: {
      dateTimeOriginal: "2023:05:10 12:05:00",
      offsetTimeOriginal: "+09:00",
      gps: { lat: NEAR_SHOP.lat + 0.00003, lng: NEAR_SHOP.lng },
    },
  },
  {
    name: "photo-dateless-shop.jpg",
    exif: { dateTimeOriginal: "2023:05:11 18:30:00", offsetTimeOriginal: "+09:00", gps: DATELESS_SHOP },
  },
  {
    name: "photo-far.jpg",
    // About 4 km from both shops.
    exif: { dateTimeOriginal: "2023:05:12 09:00:00", offsetTimeOriginal: "+09:00", gps: { lat: 43.04, lng: 141.31 } },
  },
];

export const photoFixturePath = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

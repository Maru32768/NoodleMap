// Writes the photo import fixtures: `node scripts/write-photo-fixtures.ts` from e2e/ (Node 24 strips the types).
import { readFileSync, writeFileSync } from "node:fs";
import { withExif } from "../../web/src/test/exif-jpeg.ts";
import { PHOTO_FIXTURES, photoFixturePath } from "../support/photo-fixtures.ts";

const base = new Uint8Array(readFileSync(photoFixturePath("meal-record-image.jpg")));
for (const { name, exif } of PHOTO_FIXTURES) {
  writeFileSync(photoFixturePath(name), withExif(base, exif));
  console.log(`wrote fixtures/${name}`);
}

/** The EXIF tags of a test photo, written as an iPhone writes them. */
export interface ExifSpec {
  /** "YYYY:MM:DD HH:MM:SS", the camera's wall clock. */
  dateTimeOriginal?: string;
  /** "+09:00" */
  offsetTimeOriginal?: string;
  gps?: { lat: number; lng: number };
}

const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

interface Entry {
  tag: number;
  type: number;
  count: number;
  data: Uint8Array;
}

const ascii = (tag: number, text: string): Entry => {
  const data = new TextEncoder().encode(`${text}\0`);
  return { tag, type: ASCII, count: data.length, data };
};

const long = (tag: number, value: number): Entry => {
  const data = new Uint8Array(4);
  new DataView(data.buffer).setUint32(0, value, true);
  return { tag, type: LONG, count: 1, data };
};

// Degrees, minutes and seconds (to 1/10000) as three rationals.
const dms = (tag: number, degrees: number): Entry => {
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 10_000);
  const data = new Uint8Array(24);
  const view = new DataView(data.buffer);
  [d, 1, m, 1, s, 10_000].forEach((v, i) => view.setUint32(i * 4, v, true));
  return { tag, type: RATIONAL, count: 3, data };
};

const ifdSize = (entries: readonly Entry[]) =>
  2 +
  entries.length * 12 +
  4 +
  entries.reduce((n, e) => n + (e.data.length > 4 ? e.data.length : 0), 0);

// One little-endian IFD at `offset` (from the TIFF header), its out-of-line values right after it.
function writeIfd(entries: readonly Entry[], offset: number): Uint8Array {
  const bytes = new Uint8Array(ifdSize(entries));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, entries.length, true);
  let dataAt = 2 + entries.length * 12 + 4;
  [...entries]
    .sort((a, b) => a.tag - b.tag)
    .forEach((e, i) => {
      const at = 2 + i * 12;
      view.setUint16(at, e.tag, true);
      view.setUint16(at + 2, e.type, true);
      view.setUint32(at + 4, e.count, true);
      if (e.data.length <= 4) {
        bytes.set(e.data, at + 8);
      } else {
        view.setUint32(at + 8, offset + dataAt, true);
        bytes.set(e.data, dataAt);
        dataAt += e.data.length;
      }
    });
  return bytes;
}

/** `jpeg` with an APP1 Exif segment holding `spec`, inserted right after its SOI marker. */
export function withExif(
  jpeg: Uint8Array,
  spec: ExifSpec,
): Uint8Array<ArrayBuffer> {
  const exif: Entry[] = [];
  if (spec.dateTimeOriginal !== undefined) {
    exif.push(ascii(0x9003, spec.dateTimeOriginal));
  }
  if (spec.offsetTimeOriginal !== undefined) {
    exif.push(ascii(0x9011, spec.offsetTimeOriginal));
  }
  const gps: Entry[] = spec.gps
    ? [
        ascii(0x0001, spec.gps.lat < 0 ? "S" : "N"),
        dms(0x0002, spec.gps.lat),
        ascii(0x0003, spec.gps.lng < 0 ? "W" : "E"),
        dms(0x0004, spec.gps.lng),
      ]
    : [];

  const ifd0Entries = (exifAt: number, gpsAt: number) => [
    ...(exif.length ? [long(0x8769, exifAt)] : []),
    ...(gps.length ? [long(0x8825, gpsAt)] : []),
  ];
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(ifd0Entries(0, 0));
  const gpsAt = exifAt + (exif.length ? ifdSize(exif) : 0);
  const parts = [
    new Uint8Array([0x49, 0x49, 0x2a, 0x00, ifd0At, 0, 0, 0]),
    writeIfd(ifd0Entries(exifAt, gpsAt), ifd0At),
    ...(exif.length ? [writeIfd(exif, exifAt)] : []),
    ...(gps.length ? [writeIfd(gps, gpsAt)] : []),
  ];
  const tiffLength = parts.reduce((n, p) => n + p.length, 0);
  const segmentLength = 2 + 6 + tiffLength;
  const header = new Uint8Array([
    0xff,
    0xe1,
    segmentLength >> 8,
    segmentLength & 0xff,
    ...new TextEncoder().encode("Exif\0\0"),
  ]);
  const out = new Uint8Array(jpeg.length + 4 + segmentLength - 2);
  let at = 0;
  for (const part of [
    jpeg.subarray(0, 2),
    header,
    ...parts,
    jpeg.subarray(2),
  ]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

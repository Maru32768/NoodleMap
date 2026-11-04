"""Builds server/src/main/resources/stations.csv from 国土数値情報 鉄道データ (N02).

Usage: python3 db/generate_stations.py <path to N02-YY_Station.geojson>

Download N02-YY_GML.zip from https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2024.html
and pass its UTF-8/N02-YY_Station.geojson. The data is CC BY 4.0, so the app credits it.
"""

from collections import defaultdict
import csv
import json
from pathlib import Path
import sys


OUTPUT = Path(__file__).resolve().parent.parent / "server/src/main/resources/stations.csv"


def main(source):
    with open(source, encoding="utf-8") as f:
        features = json.load(f)["features"]

    # N02_005g groups same-named stations within 300m (JR, Tokyu and Metro 渋谷 as one).
    groups = defaultdict(list)
    for feature in features:
        props = feature["properties"]
        coords = feature["geometry"]["coordinates"]
        lng = sum(c[0] for c in coords) / len(coords)
        lat = sum(c[1] for c in coords) / len(coords)
        groups[props["N02_005g"]].append((props["N02_005"], lat, lng))

    with OUTPUT.open("w", encoding="utf-8", newline="") as out:
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(["NAME", "LAT", "LNG"])
        for code in sorted(groups):
            members = groups[code]
            names = {name for name, _, _ in members}
            if len(names) != 1:
                raise ValueError(f"Group {code} mixes names: {names}")
            lat = sum(m[1] for m in members) / len(members)
            lng = sum(m[2] for m in members) / len(members)
            writer.writerow([names.pop(), f"{lat:.5f}", f"{lng:.5f}"])
    print(f"Wrote {len(groups)} stations to {OUTPUT}")


if __name__ == "__main__":
    main(sys.argv[1])

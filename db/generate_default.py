import csv
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
from uuid import UUID


DB_DIR = Path(__file__).resolve().parent
SEED_TIMESTAMP = "2000-01-01 00:00:00"


def rows(filename):
    with (DB_DIR / "data" / filename).open(encoding="utf-8", newline="") as source:
        yield from csv.DictReader(source)


def import_seed(connection):
    connection.execute("PRAGMA foreign_keys = ON")
    with connection:
        for category in ("ramen", "udon"):
            for row in rows(f"{category}.csv"):
                closed = row["CLOSED"].upper()
                if closed not in ("TRUE", "FALSE"):
                    raise ValueError(f"Invalid CLOSED value: {closed}")
                connection.execute(
                    """INSERT INTO shops
                       (id, name, lat, lng, postal_code, address, google_place_id,
                        closed_at, category, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        str(UUID(row["ID"])), row["NAME"], float(row["LAT"]),
                        float(row["LNG"]), row["POSTAL_CODE"], row["ADDRESS"],
                        row["GOOGLE_PLACE_ID"].strip() or None,
                        SEED_TIMESTAMP if closed == "TRUE" else None, category,
                        SEED_TIMESTAMP, SEED_TIMESTAMP,
                    ),
                )
        for row in rows("eaten_shops.csv"):
            rate = float(row["rate"])
            connection.execute(
                """INSERT INTO meal_records
                   (id, eaten_on, rate, created_at, updated_at)
                   VALUES (?, NULL, ?, ?, ?)""",
                (str(UUID(row["id"])),
                 None if rate == 0 else max(0, min(100, rate)),
                 SEED_TIMESTAMP, SEED_TIMESTAMP),
            )
            connection.execute(
                "INSERT INTO meal_record_shops (meal_record_id, shop_id, sort_order) VALUES (?, ?, 0)",
                (str(UUID(row["id"])), str(UUID(row["shop_id"]))),
            )
            # The shop's own お気に入り度 starts from its record's, as migration 00019 does for live data.
            if rate != 0:
                connection.execute(
                    "UPDATE shops SET rate = ? WHERE id = ?",
                    (max(0, min(100, rate)), str(UUID(row["shop_id"]))),
                )
        connection.execute("UPDATE goose_db_version SET tstamp = ?", (SEED_TIMESTAMP,))
    if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise RuntimeError("Seed database failed integrity_check")
    if connection.execute("PRAGMA foreign_key_check").fetchall():
        raise RuntimeError("Seed database contains foreign key violations")
    for table in ("users", "sessions"):
        if connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]:
            raise RuntimeError(f"Seed database contains {table}")
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    connection.execute("PRAGMA journal_mode = DELETE")
    connection.execute("VACUUM")


def main():
    server = DB_DIR.parent / "server"
    gradle = server / ("gradlew.bat" if os.name == "nt" else "gradlew")
    with tempfile.TemporaryDirectory(prefix=".seed-", dir=DB_DIR) as temporary:
        database = Path(temporary) / "default.db"
        subprocess.run(
            [str(gradle), "--console=plain", "createSeedSchema", f"-PseedDbPath={database}"],
            cwd=server, check=True,
        )
        with closing(sqlite3.connect(database)) as connection:
            import_seed(connection)
            shops = connection.execute("SELECT count(*) FROM shops").fetchone()[0]
            meal_records = connection.execute("SELECT count(*) FROM meal_records").fetchone()[0]
        os.replace(database, DB_DIR / "default.db")
    print(f"Generated db/default.db: {shops} shops, {meal_records} meal records")


if __name__ == "__main__":
    main()

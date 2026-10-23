// Playwright webServer entry for the server: wipe the E2E database, build the fat
// jar into SERVER_BUILD_DIR (Gradle no-ops when it is up to date), then run it in
// the foreground. A separate build directory leaves server/build to `./gradlew run`.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../server");
const dbPath = process.env.DB_PATH;
const buildDir = process.env.SERVER_BUILD_DIR;
if (!dbPath || !buildDir) {
  throw new Error("DB_PATH and SERVER_BUILD_DIR must be set by playwright.config.ts");
}

mkdirSync(dirname(dbPath), { recursive: true });
for (const suffix of ["", "-wal", "-shm", ".bak"]) {
  rmSync(dbPath + suffix, { force: true });
}
// Local-disk visit images live next to the database.
rmSync(resolve(dirname(dbPath), "visit-images"), { recursive: true, force: true });

const gradlew = resolve(serverDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
// A .bat needs a shell on Windows; one command string avoids Node's DEP0190 warning.
const build = spawnSync(`"${gradlew}" buildFatJar --quiet "-PnoodleMapBuildDir=${buildDir}"`, {
  cwd: serverDir,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const server = spawn("java", ["-jar", resolve(buildDir, "libs/noodle-map-server-all.jar")], {
  stdio: "inherit",
});
server.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

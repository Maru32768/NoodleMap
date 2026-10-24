// Playwright webServer entry for the server: wipe the E2E database, build the fat
// jar into SERVER_BUILD_DIR (Gradle no-ops when it is up to date), then run it in
// the foreground. A separate build directory leaves server/build to `./gradlew run`.
import { spawn } from "node:child_process";
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

const isWindows = process.platform === "win32";
const gradlew = resolve(serverDir, isWindows ? "gradlew.bat" : "gradlew");
// Gradle's daemon (and the Kotlin compile daemon it starts) outlive the build and
// keep every handle they inherit. If one of them holds the pipe that `npm test` writes
// to, `npm test | tail` never sees end-of-file and hangs after Playwright exits.
// - Pipe the build's stdio rather than inherit it, and wait for "exit" rather than
//   "close", because a daemon may keep the pipes' write ends open.
// - On Windows that is not enough: every process here inherits every inheritable
//   handle of its parent, including the caller's stdout. Build without long-lived
//   daemons there, at the cost of ~20 s per run over a warm daemon.
const daemonArgs = isWindows ? " --no-daemon -Pkotlin.compiler.execution.strategy=in-process" : "";
// A .bat needs a shell on Windows; one command string avoids Node's DEP0190 warning.
const build = spawn(`"${gradlew}" buildFatJar --quiet${daemonArgs} "-PnoodleMapBuildDir=${buildDir}"`, {
  cwd: serverDir,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
});
build.stdout.pipe(process.stdout, { end: false });
build.stderr.pipe(process.stderr, { end: false });
const buildStatus = await new Promise((resolveStatus, reject) => {
  build.on("error", reject);
  build.on("exit", (code) => resolveStatus(code));
});
build.stdout.destroy();
build.stderr.destroy();
if (buildStatus !== 0) {
  process.exit(buildStatus ?? 1);
}

const server = spawn("java", ["-jar", resolve(buildDir, "libs/noodle-map-server-all.jar")], {
  stdio: "inherit",
});
server.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

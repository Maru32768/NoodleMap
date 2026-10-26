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
// Local-disk meal record images live next to the database.
rmSync(resolve(dirname(dbPath), "meal-record-images"), { recursive: true, force: true });

const isWindows = process.platform === "win32";
const gradlew = resolve(serverDir, isWindows ? "gradlew.bat" : "gradlew");
// Gradle's daemon (and the Kotlin compile daemon it starts) outlive the build and keep
// the handles they inherit. On Windows a child inherits every inheritable handle of its
// parent, including the stdout that `npm test` writes to, so a daemon would keep
// `npm test | tail` from seeing end-of-file after Playwright exits. Build without
// long-lived processes there; see e2e/README.md for the cost. Elsewhere a daemon only
// inherits this script's stdio, which is Playwright's pipe, not the caller's.
const daemonArgs = isWindows
  ? ' --no-daemon "-Dorg.gradle.jvmargs=-Xmx1g -XX:MaxMetaspaceSize=512m"' +
    " -Pkotlin.compiler.execution.strategy=in-process"
  : "";
// A .bat needs a shell on Windows; one command string avoids Node's DEP0190 warning.
const build = spawnSync(
  `"${gradlew}" buildFatJar --quiet${daemonArgs} "-PnoodleMapBuildDir=${buildDir}"`,
  { cwd: serverDir, stdio: "inherit", shell: true },
);
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

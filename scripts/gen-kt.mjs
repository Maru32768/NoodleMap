// Regenerates the Kotlin server's API bindings via Fabrikt. Invokes the Gradle wrapper
// by absolute path so it works from any shell (cmd/PowerShell/sh) regardless of whether
// the shell searches the current directory for executables.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(repoRoot, "server");
const wrapper = join(serverDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

execFileSync(wrapper, ["fabriktGenerate"], { cwd: serverDir, stdio: "inherit", shell: true });

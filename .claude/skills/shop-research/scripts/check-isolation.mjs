import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SECRET_ENV = /^(AWS_|R2_|CLOUDFLARE_|RENDER_|GOOGLE_|GH_TOKEN$|GITHUB_TOKEN$|TYPESAFE_|BACKUP_R2_|DB_PATH$|ADMIN_EMAIL$)/;
const WORKSPACE_PATHS = ['.env', 'mise.local.toml', 'db-data'];
const HOME_PATHS = ['.ssh', '.aws', '.netrc', '.config/gh', '.config/rclone', '.docker/config.json'];

function ancestors(path) {
  const parent = dirname(path);
  return parent === path ? [path] : [path, ...ancestors(parent)];
}

/** Reports names only, so the report itself cannot carry a secret value. */
export function findExposures({ env, cwd, home, exists }) {
  const directories = ancestors(cwd);
  return [
    ...Object.keys(env)
      .filter((name) => SECRET_ENV.test(name))
      .map((name) => `env:${name}`),
    ...WORKSPACE_PATHS.filter((path) => directories.some((directory) => exists(join(directory, path)))).map(
      (path) => `workspace:${path}`,
    ),
    ...HOME_PATHS.filter((path) => exists(join(home, path))).map((path) => `home:${path}`),
  ];
}

// realpath: run through a symlink or junction, a plain comparison skips the check and exits 0, which reads as a pass.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const exposures = findExposures({ env: process.env, cwd: process.cwd(), home: homedir(), exists: existsSync });
  if (exposures.length) {
    console.error(`Not an isolated environment. Found:\n${exposures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('No credentials or production data found.');
  }
}

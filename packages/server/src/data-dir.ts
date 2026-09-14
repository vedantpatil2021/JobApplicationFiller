import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/server/src → repo root `/profile`, independent of process.cwd().
// npm workspaces run with cwd = packages/server; cwd-relative `./profile`
// would write the pairing token where Vite cannot read it.
const repoRootProfile = resolve(dirname(fileURLToPath(import.meta.url)), '../../../profile')

export function resolveDataDir(
  env: { JAF_DATA_DIR?: string } = process.env,
  cwd: string = process.cwd(),
): string {
  const override = env.JAF_DATA_DIR
  if (override) return resolve(cwd, override)
  return repoRootProfile
}

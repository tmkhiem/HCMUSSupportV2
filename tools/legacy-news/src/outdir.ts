import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** `%LOCALAPPDATA%\HCMUSSupportV2\legacy\news` (or the XDG data directory off Windows). */
export function defaultOutDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.LOCALAPPDATA && env.LOCALAPPDATA.length > 0
      ? env.LOCALAPPDATA
      : env.XDG_DATA_HOME && env.XDG_DATA_HOME.length > 0
        ? env.XDG_DATA_HOME
        : path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'HCMUSSupportV2', 'legacy', 'news')
}

/** The nearest ancestor (or the directory itself) that holds a `.git` entry, or null. The directory need not exist. */
export function findGitWorkTree(dir: string): string | null {
  let current = path.resolve(dir)
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * The converted output holds personal data, so it must never land in a git work tree where it could be committed.
 * Throws when `dir` is inside one.
 */
export function assertOutsideGitWorkTree(dir: string): string {
  const resolved = path.resolve(dir)
  const root = findGitWorkTree(resolved)
  if (root) {
    throw new Error(
      `Refusing to write into a git work tree (${root}): the output contains personal data. Choose a directory outside it with --out.`,
    )
  }
  return resolved
}

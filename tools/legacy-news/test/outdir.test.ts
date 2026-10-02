import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertOutsideGitWorkTree, defaultOutDir, findGitWorkTree } from '../src/outdir.ts'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-news-outdir-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('out dir guard', () => {
  it('accepts a directory outside any git work tree', () => {
    const dir = path.join(tmp, 'out')
    expect(assertOutsideGitWorkTree(dir)).toBe(path.resolve(dir))
  })

  it('refuses a work tree root, a sub-folder that does not exist yet and a deep one', () => {
    fs.mkdirSync(path.join(tmp, 'repo', '.git'), { recursive: true })
    for (const dir of [path.join(tmp, 'repo'), path.join(tmp, 'repo', 'out'), path.join(tmp, 'repo', 'a', 'b', 'c')]) {
      expect(() => assertOutsideGitWorkTree(dir)).toThrow(/git work tree/)
    }
    expect(findGitWorkTree(path.join(tmp, 'repo', 'x'))).toBe(path.join(tmp, 'repo'))
  })

  it('also recognises a worktree, where .git is a file', () => {
    fs.mkdirSync(path.join(tmp, 'wt'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'wt', '.git'), 'gitdir: /somewhere/else\n')
    expect(() => assertOutsideGitWorkTree(path.join(tmp, 'wt', 'out'))).toThrow(/git work tree/)
  })

  it('resolves relative paths before checking', () => {
    fs.mkdirSync(path.join(tmp, 'repo', '.git'), { recursive: true })
    const previous = process.cwd()
    process.chdir(path.join(tmp, 'repo'))
    try {
      expect(() => assertOutsideGitWorkTree('out')).toThrow(/git work tree/)
    } finally {
      process.chdir(previous)
    }
  })

  it.skipIf(!findGitWorkTree(import.meta.dirname))('refuses the folder this tool lives in', () => {
    expect(() => assertOutsideGitWorkTree(path.join(import.meta.dirname, '..', 'out'))).toThrow(/git work tree/)
  })
})

describe('defaultOutDir', () => {
  it('lives under %LOCALAPPDATA%', () => {
    expect(defaultOutDir({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' })).toBe(path.join('C:\\Users\\x\\AppData\\Local', 'HCMUSSupportV2', 'legacy', 'news'))
  })

  it('falls back to the XDG data directory', () => {
    expect(defaultOutDir({ XDG_DATA_HOME: '/data' })).toBe(path.join('/data', 'HCMUSSupportV2', 'legacy', 'news'))
  })
})

import { parseOptions, requireOption } from './cliUtil.ts'
import { DEFAULT_BANNER_PINNED_UNTIL } from './convert.ts'
import { runConvert, summaryLines } from './convertRun.ts'
import { defaultOutDir } from './outdir.ts'
import { postExitCode, postSummaryLines, runPost } from './post.ts'

const str = (v: string | boolean | undefined): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)

export async function convertCommand(args: string[]): Promise<number> {
  const v = parseOptions(args, { path: { type: 'string' }, out: { type: 'string' }, 'banner-pinned-until': { type: 'string' } })
  const result = runConvert({
    dataPath: requireOption(v.path, 'path'),
    outDir: str(v.out) ?? defaultOutDir(),
    bannerPinnedUntil: str(v['banner-pinned-until']) ?? DEFAULT_BANNER_PINNED_UNTIL,
  })
  for (const line of summaryLines(result.report)) console.log(line)
  console.log(`Output written to ${result.outDir} (payloads, previews, report.md, report.json).`)
  return 0
}

export async function postCommand(args: string[]): Promise<number> {
  const v = parseOptions(args, {
    in: { type: 'string' },
    api: { type: 'string' },
    'dry-run': { type: 'boolean' },
    only: { type: 'string' },
  })
  const result = await runPost({
    dir: str(v.in) ?? defaultOutDir(),
    api: requireOption(v.api, 'api'),
    token: process.env.LEGACY_API_TOKEN ?? '',
    dryRun: v['dry-run'] === true,
    only: str(v.only)?.split(','),
  })
  for (const line of postSummaryLines(result)) console.log(line)
  return postExitCode(result)
}

/** convert, then post what was just converted. */
export async function allCommand(args: string[]): Promise<number> {
  const v = parseOptions(args, {
    path: { type: 'string' },
    out: { type: 'string' },
    'banner-pinned-until': { type: 'string' },
    api: { type: 'string' },
    'dry-run': { type: 'boolean' },
    only: { type: 'string' },
  })
  const out = str(v.out) ?? defaultOutDir()
  const convertArgs = ['--path', requireOption(v.path, 'path'), '--out', out]
  if (str(v['banner-pinned-until'])) convertArgs.push('--banner-pinned-until', str(v['banner-pinned-until'])!)
  await convertCommand(convertArgs)

  const postArgs = ['--in', out, '--api', requireOption(v.api, 'api')]
  if (v['dry-run'] === true) postArgs.push('--dry-run')
  if (str(v.only)) postArgs.push('--only', str(v.only)!)
  return postCommand(postArgs)
}

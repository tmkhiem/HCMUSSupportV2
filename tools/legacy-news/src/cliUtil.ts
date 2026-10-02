import { parseArgs } from 'node:util'

export type OptionSpec = Record<string, { type: 'string' | 'boolean'; short?: string }>

export class UsageError extends Error {}

/** Parses `--flag value` options and throws UsageError (exit code 2) on unknown ones. */
export function parseOptions<T extends OptionSpec>(args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: false, strict: true }).values
  } catch (e) {
    throw new UsageError((e as Error).message)
  }
}

export function requireOption(value: string | boolean | undefined, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new UsageError(`Missing --${name}`)
  return value
}

/** Runs a CLI entry point: prints the message of a failure (never a stack) and sets the exit code. */
export async function runCli(main: () => Promise<number | void>): Promise<void> {
  try {
    const code = await main()
    process.exitCode = code ?? 0
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`)
    process.exitCode = e instanceof UsageError ? 2 : 1
  }
}

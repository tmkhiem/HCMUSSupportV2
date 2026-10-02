import { runCli } from './cliUtil.ts'
import { convertCommand } from './commands.ts'

await runCli(() => convertCommand(process.argv.slice(2)))

import { runCli } from './cliUtil.ts'
import { postCommand } from './commands.ts'

await runCli(() => postCommand(process.argv.slice(2)))

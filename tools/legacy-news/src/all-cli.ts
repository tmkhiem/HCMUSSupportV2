import { runCli } from './cliUtil.ts'
import { allCommand } from './commands.ts'

await runCli(() => allCommand(process.argv.slice(2)))

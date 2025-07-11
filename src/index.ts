import { Command } from 'commander'
import packageJson from '../package.json' assert { type: 'json' }
import { startProxyServer } from './server.js'

async function main() {
  const program = new Command()

  program
    .name('arthack-proxy')
    .description('Arthack Proxy CLI tool')
    .version(packageJson.version)

  program
    .command('start')
    .description('Start the reverse proxy server')
    .option('-p, --port <port>', 'Port to listen on', '80')
    .option('-h, --host <host>', 'Host to bind to', '0.0.0.0')
    .action(async options => {
      const port = parseInt(options.port, 10)
      if (isNaN(port)) {
        console.error('Invalid port number')
        process.exit(1)
      }

      console.log(`Starting proxy server on ${options.host}:${port}...`)
      await startProxyServer(port, options.host)
    })

  try {
    program.exitOverride()
    program.configureOutput({
      writeErr: str => process.stderr.write(str),
    })

    await program.parseAsync(process.argv)
  } catch (error: any) {
    if (
      error.code === 'commander.help' ||
      error.code === 'commander.helpDisplayed' ||
      error.code === 'commander.version'
    ) {
      process.exit(0)
    }
    console.error('Error:', error.message || error)
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})

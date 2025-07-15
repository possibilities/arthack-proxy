import { Command } from 'commander'
import chalk from 'chalk'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { startCommand } from './commands/start.js'
import { setupCertsCommand } from './commands/setup-certs.js'
import { setupDnsCommand } from './commands/setup-dns.js'
import { checkDnsCommand } from './commands/check-dns.js'
import { listCommand } from './commands/list.js'

const require = createRequire(import.meta.url)
const currentModulePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentModulePath)
const projectRoot = join(currentDirectory, '..')
const packageJsonPath = join(projectRoot, 'package.json')
const packageJson = require(packageJsonPath)

const program = new Command()

program
  .name('arthack')
  .description(
    chalk.cyan('Arthack Proxy - Dynamic subdomain proxy for local development'),
  )
  .version(packageJson.version)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-p, --port <number>', 'Port to run the server on', '443')
  .option('-h, --host <string>', 'Host to bind to', '0.0.0.0')
  .option('--http-port <number>', 'HTTP port for redirect server', '80')
  .option('--no-https', 'Disable HTTPS and run HTTP only')
  .action(async options => {
    await startCommand(options)
  })

program
  .command('setup:certs')
  .description('Set up SSL certificates with proper wildcard support')
  .option('--hostname <name>', 'Primary hostname for certificates')
  .option('--skip-dns', 'Skip DNS configuration prompts')
  .option('--skip-ports', 'Skip privileged port binding setup')
  .action(setupCertsCommand)

program
  .command('setup:dns')
  .description('Configure DNS for wildcard domain resolution')
  .option('--simple', 'Use simple DNS setup without dnsmasq')
  .action(setupDnsCommand)

program
  .command('check:dns')
  .description('Check DNS configuration and resolution')
  .action(checkDnsCommand)

program
  .command('list')
  .alias('ls')
  .description('List active proxy mappings')
  .option('-w, --watch', 'Watch for changes in real-time')
  .action(listCommand)

program.parse(process.argv)

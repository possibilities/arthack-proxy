import chalk from 'chalk'
import { DynamicConfigManager } from '../dynamic-config.js'
import { hostname } from 'os'

interface ListOptions {
  watch?: boolean
  targetHost?: string
}

export async function listCommand(options: ListOptions) {
  const targetHost = options.targetHost || 'localhost'
  const configManager = new DynamicConfigManager(targetHost)
  const systemHostname = hostname()

  async function fetchAndDisplayMappings() {
    const mappings = await configManager.fetchTmuxSessions()
    const entries = Object.entries(mappings)

    console.clear()
    const header =
      targetHost === 'localhost'
        ? '🌐 Active Proxy Mappings\n'
        : `🌐 Active Proxy Mappings on ${targetHost}\n`
    console.log(chalk.cyan(header))

    if (entries.length === 0) {
      console.log(
        chalk.yellow(
          'No active tmux sessions with PORT environment variable found.',
        ),
      )
      console.log(chalk.gray('\nTo create a mapping:'))
      const tmuxPrefix = targetHost === 'localhost' ? '' : `ssh ${targetHost} `
      console.log(
        chalk.gray(
          `1. Start a tmux session: ${tmuxPrefix}tmux -L tmux-composer-system new -s myapp`,
        ),
      )
      console.log(chalk.gray('2. Set PORT variable: export PORT=3000'))
      console.log(chalk.gray('3. Start your app'))
      return
    }

    console.log(chalk.white('Subdomain → Port\n'))

    entries.forEach(([subdomain, port]) => {
      console.log(chalk.green(`${subdomain} → ${port}`))
      console.log(chalk.gray(`  https://${subdomain}.dev.localhost`))
      console.log(chalk.gray(`  https://${subdomain}.dev.${systemHostname}`))
      console.log('')
    })

    console.log(
      chalk.gray(
        `Found ${entries.length} active mapping${entries.length === 1 ? '' : 's'}`,
      ),
    )
  }

  await fetchAndDisplayMappings()

  if (options.watch) {
    console.log(
      chalk.gray('\n👀 Watching for changes... (Press Ctrl+C to exit)'),
    )

    const intervalId = setInterval(async () => {
      try {
        await fetchAndDisplayMappings()
      } catch (error) {
        console.error(chalk.red('Error fetching mappings:'), error)
      }
    }, 3000)

    process.on('SIGINT', () => {
      clearInterval(intervalId)
      process.exit(0)
    })
  }
}

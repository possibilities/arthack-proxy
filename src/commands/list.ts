import chalk from 'chalk'
import { DynamicConfigManager, isBrowserMapping } from '../dynamic-config.js'
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
    const tmuxMappings = await configManager.fetchTmuxSessions()
    const browserMappings = await configManager.fetchBrowserSessions()
    const allMappings = { ...tmuxMappings, ...browserMappings }
    const entries = Object.entries(allMappings)

    console.clear()
    const header =
      targetHost === 'localhost'
        ? '🌐 Active Proxy Mappings\n'
        : `🌐 Active Proxy Mappings on ${targetHost}\n`
    console.log(chalk.cyan(header))

    if (entries.length === 0) {
      console.log(chalk.yellow('No active mappings found.'))
      console.log(chalk.gray('\nTo create a mapping:'))
      const tmuxPrefix = targetHost === 'localhost' ? '' : `ssh ${targetHost} `
      console.log(chalk.gray('\nFor tmux sessions:'))
      console.log(
        chalk.gray(
          `1. Start a tmux session: ${tmuxPrefix}tmux -L tmux-composer-system new -s myapp`,
        ),
      )
      console.log(chalk.gray('2. Set PORT variable: export PORT=3000'))
      console.log(chalk.gray('3. Start your app'))
      console.log(chalk.gray('\nFor browsers:'))
      console.log(
        chalk.gray('1. Start a browser: browser-composer start my-browser'),
      )
      console.log(chalk.gray('2. Browser ports will be automatically mapped'))
      return
    }

    console.log(chalk.white('Subdomain → Port\n'))

    entries.forEach(([subdomain, port]) => {
      const icon = isBrowserMapping(subdomain) ? '🖥️ ' : ''
      console.log(chalk.green(`${icon}${subdomain} → ${port}`))
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

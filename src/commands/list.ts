import chalk from 'chalk'
import { DynamicConfigManager } from '../dynamic-config.js'
import { hostname } from 'os'

interface ListOptions {
  watch?: boolean
}

export async function listCommand(options: ListOptions) {
  const configManager = new DynamicConfigManager()
  const systemHostname = hostname()

  async function displayMappings() {
    const mappings = await configManager.fetchTmuxSessions()
    const entries = Object.entries(mappings)

    console.clear()
    console.log(chalk.cyan('🌐 Active Proxy Mappings\n'))

    if (entries.length === 0) {
      console.log(
        chalk.yellow(
          'No active tmux sessions with PORT environment variable found.',
        ),
      )
      console.log(chalk.gray('\nTo create a mapping:'))
      console.log(
        chalk.gray(
          '1. Start a tmux session: tmux -L tmux-composer-system new -s myapp',
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

  await displayMappings()

  if (options.watch) {
    console.log(
      chalk.gray('\n👀 Watching for changes... (Press Ctrl+C to exit)'),
    )

    setInterval(async () => {
      await displayMappings()
    }, 3000)
  }
}

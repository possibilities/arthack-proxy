import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { execSync } from 'child_process'
import { hostname } from 'os'
import { existsSync, writeFileSync } from 'fs'

interface SetupDnsOptions {
  simple?: boolean
}

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function isServiceActive(service: string): boolean {
  try {
    execSync(`systemctl is-active --quiet ${service}`)
    return true
  } catch {
    return false
  }
}

export async function setupDnsCommand(options: SetupDnsOptions) {
  const systemHostname = hostname()

  console.log(chalk.cyan('🌐 Setting up wildcard DNS resolution\n'))

  if (options.simple) {
    console.log(
      chalk.yellow('📝 Simple setup: Add these entries to /etc/hosts:\n'),
    )
    const domains = [
      'dev.localhost',
      'api.dev.localhost',
      'app.dev.localhost',
      'test.dev.localhost',
      `dev.${systemHostname}`,
      `api.dev.${systemHostname}`,
      `app.dev.${systemHostname}`,
      `test.dev.${systemHostname}`,
    ]

    domains.forEach(domain => {
      console.log(`127.0.0.1    ${domain}`)
    })

    console.log(
      chalk.gray('\nNote: This requires manual updates for each new subdomain'),
    )
    return
  }

  if (!commandExists('dnsmasq')) {
    console.log(chalk.yellow('📦 dnsmasq is not installed'))

    const { install } = await prompts({
      type: 'confirm',
      name: 'install',
      message: 'Install dnsmasq for wildcard DNS support?',
      initial: true,
    })

    if (install) {
      const installSpinner = ora('Installing dnsmasq...').start()
      try {
        execSync('sudo apt update', { stdio: 'pipe' })
        execSync('sudo apt install -y dnsmasq', { stdio: 'pipe' })
        installSpinner.succeed('dnsmasq installed successfully')
      } catch (error) {
        installSpinner.fail('Failed to install dnsmasq')
        console.error(error)
        process.exit(1)
      }
    } else {
      console.log(
        chalk.yellow(
          '\n⏭️  Skipped. Use --simple flag for manual /etc/hosts setup',
        ),
      )
      process.exit(0)
    }
  }

  if (!isServiceActive('dnsmasq')) {
    if (
      execSync('ps aux | grep -q "[d]nsmasq.*libvirt" || echo "not found"', {
        encoding: 'utf-8',
      }).trim() !== 'not found'
    ) {
      console.log(
        chalk.gray('📝 Found libvirt dnsmasq, but need system-wide dnsmasq'),
      )
    }

    const enableSpinner = ora('Enabling system-wide dnsmasq...').start()
    try {
      execSync('sudo systemctl enable dnsmasq', { stdio: 'pipe' })
      execSync('sudo systemctl start dnsmasq', { stdio: 'pipe' })
      enableSpinner.succeed('dnsmasq service enabled and started')
    } catch {
      enableSpinner.warn(
        'Could not start dnsmasq (may conflict with other services)',
      )
    }
  }

  if (!existsSync('/etc/dnsmasq.d')) {
    console.log(chalk.yellow('📁 Creating /etc/dnsmasq.d directory...'))
    execSync('sudo mkdir -p /etc/dnsmasq.d')
  }

  const configContent = `# Wildcard DNS for arthack-proxy
# Routes *.dev.localhost and *.dev.${systemHostname} to 127.0.0.1

# Wildcard DNS entries for 3-label domains (fixes curl/wget issues)
address=/.dev.localhost/127.0.0.1
address=/.dev.${systemHostname}/127.0.0.1
`

  const configPath = '/tmp/arthack-proxy.conf'
  writeFileSync(configPath, configContent)

  const writeConfigSpinner = ora('Writing DNS configuration...').start()
  try {
    execSync(`sudo cp ${configPath} /etc/dnsmasq.d/arthack-proxy.conf`)
    writeConfigSpinner.succeed('DNS configuration written')
  } catch (error) {
    writeConfigSpinner.fail('Failed to write DNS configuration')
    console.error(error)
    process.exit(1)
  }

  if (
    !execSync(
      'grep -q "^conf-dir=/etc/dnsmasq.d" /etc/dnsmasq.conf 2>/dev/null || echo "not found"',
      { encoding: 'utf-8' },
    ).includes('conf-dir')
  ) {
    console.log(chalk.yellow('📝 Enabling dnsmasq config directory...'))
    execSync(
      'echo "conf-dir=/etc/dnsmasq.d" | sudo tee -a /etc/dnsmasq.conf > /dev/null',
    )
  }

  const port53InUse =
    execSync('sudo ss -tulpn | grep -q ":53 " && echo "yes" || echo "no"', {
      encoding: 'utf-8',
    }).trim() === 'yes'

  if (port53InUse && isServiceActive('systemd-resolved')) {
    console.log(chalk.yellow('⚠️  systemd-resolved is using port 53'))
    console.log(
      chalk.cyan(
        '📝 Configuring dnsmasq to work alongside systemd-resolved...',
      ),
    )

    const portConfig = `# Run on a different port to avoid conflicts
port=5353
bind-interfaces
listen-address=127.0.0.1
`
    writeFileSync('/tmp/00-arthack-proxy-port.conf', portConfig)
    execSync('sudo cp /tmp/00-arthack-proxy-port.conf /etc/dnsmasq.d/')

    const resolvedConfig = `[Resolve]
DNS=127.0.0.1:5353
Domains=~dev.localhost ~dev.${systemHostname}
`
    writeFileSync('/tmp/arthack-proxy-resolved.conf', resolvedConfig)
    execSync('sudo mkdir -p /etc/systemd/resolved.conf.d/')
    execSync(
      'sudo cp /tmp/arthack-proxy-resolved.conf /etc/systemd/resolved.conf.d/',
    )

    const restartSpinner = ora('Restarting services...').start()
    try {
      execSync('sudo systemctl restart dnsmasq', { stdio: 'pipe' })
      execSync('sudo systemctl restart systemd-resolved', { stdio: 'pipe' })
      restartSpinner.succeed('Services restarted successfully')
    } catch {
      restartSpinner.warn(
        'Service restart had issues (this is sometimes expected)',
      )
    }
  } else {
    const restartSpinner = ora('Starting dnsmasq...').start()
    try {
      execSync('sudo systemctl restart dnsmasq', { stdio: 'pipe' })
      restartSpinner.succeed('dnsmasq started successfully')
    } catch (error) {
      restartSpinner.fail('Failed to start dnsmasq')
      console.error(error)
    }
  }

  console.log(chalk.green('\n✅ DNS configuration complete!'))
  console.log(chalk.cyan('\n🌐 You can now access services using:'))
  console.log(chalk.white(`   http://myapp.dev.localhost`))
  console.log(chalk.white(`   https://myapp.dev.localhost`))
  console.log(chalk.white(`   http://myapp.dev.${systemHostname}`))
  console.log(chalk.white(`   https://myapp.dev.${systemHostname}`))

  console.log(
    chalk.gray('\n💡 Run "arthack check:dns" to verify DNS resolution'),
  )
}

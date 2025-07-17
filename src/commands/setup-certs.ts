import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { execSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { hostname } from 'os'
import { getCertsDirectory, getCertificatePaths } from '../config-paths.js'

interface SetupCertsOptions {
  hostname?: string
  skipDns?: boolean
  skipPorts?: boolean
}

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })

    execSync(`${command} --version`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function setupCertsCommand(options: SetupCertsOptions) {
  console.log(chalk.cyan('🔐 Setting up SSL certificates for arthack-proxy\n'))

  const systemHostname = options.hostname || hostname()

  if (!commandExists('mkcert')) {
    console.log(chalk.yellow('📦 mkcert is not installed'))

    if (existsSync('/usr/local/bin/mkcert')) {
      console.log(
        chalk.yellow('Found corrupted mkcert installation, removing...'),
      )
      try {
        execSync('sudo rm /usr/local/bin/mkcert', { stdio: 'pipe' })
      } catch {}
    }

    const { install } = await prompts({
      type: 'confirm',
      name: 'install',
      message: 'Install mkcert for SSL certificate generation?',
      initial: true,
    })

    if (install) {
      const installSpinner = ora('Installing mkcert...').start()
      try {
        execSync(
          `curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | grep '"browser_download_url".*linux-amd64' | cut -d'"' -f4 | xargs curl -L -o /tmp/mkcert`,
          { stdio: 'pipe' },
        )
        execSync('sudo mv /tmp/mkcert /usr/local/bin/mkcert', { stdio: 'pipe' })
        execSync('sudo chmod +x /usr/local/bin/mkcert', { stdio: 'pipe' })
        installSpinner.succeed('mkcert installed successfully')
      } catch (error) {
        installSpinner.fail('Failed to install mkcert')
        console.error(error)
        console.log(chalk.yellow('\nTo install mkcert manually:'))
        console.log(
          chalk.gray(
            '  Visit: https://github.com/FiloSottile/mkcert#installation',
          ),
        )
        process.exit(1)
      }
    } else {
      console.log(chalk.yellow('\n⏭️  Skipped. To install mkcert manually:'))
      console.log(
        chalk.gray(
          '  Visit: https://github.com/FiloSottile/mkcert#installation',
        ),
      )
      process.exit(0)
    }
  }

  console.log(chalk.green('✅ mkcert is installed'))

  const spinner = ora('Installing mkcert root CA...').start()
  try {
    execSync('mkcert -install', { stdio: 'pipe' })
    spinner.succeed('mkcert root CA installed')
  } catch (error) {
    spinner.fail('Failed to install mkcert root CA')
    console.error(error)
    process.exit(1)
  }

  const certsDir = getCertsDirectory()
  if (!existsSync(certsDir)) {
    mkdirSync(certsDir, { recursive: true })
  }

  const paths = getCertificatePaths()
  const certPath = paths.cert
  const keyPath = paths.key

  console.log(
    chalk.cyan(
      '\n📝 Generating wildcard certificates with proper 3-label support...',
    ),
  )
  console.log(chalk.gray('   This fixes the curl/wget validation issues\n'))

  const domains = [
    'localhost',
    '*.dev.localhost',
    'dev.localhost',
    systemHostname,
    `*.dev.${systemHostname}`,
    `dev.${systemHostname}`,
    '127.0.0.1',
    '::1',
  ]

  console.log(chalk.yellow('🌐 Certificate will be valid for:'))
  domains.forEach(domain => {
    console.log(chalk.gray(`   - ${domain}`))
  })

  const generateSpinner = ora('\nGenerating certificates...').start()
  try {
    const mkcertCmd = `mkcert -cert-file "${certPath}" -key-file "${keyPath}" ${domains.join(' ')}`
    execSync(mkcertCmd, { stdio: 'pipe' })
    generateSpinner.succeed('Certificates generated successfully')
  } catch (error) {
    generateSpinner.fail('Failed to generate certificates')
    console.error(error)
    process.exit(1)
  }

  console.log(chalk.green('\n✅ Certificates created:'))
  console.log(chalk.gray(`   ${certPath}`))
  console.log(chalk.gray(`   ${keyPath}`))

  console.log(chalk.green('\n🚀 Your proxy server can now use HTTPS!'))
  console.log(chalk.cyan('\n🌐 You can access your services via:'))
  console.log(chalk.white(`   https://subdomain.dev.localhost`))
  console.log(chalk.white(`   https://subdomain.dev.${systemHostname}`))

  if (!options.skipPorts) {
    const { enablePorts } = await prompts({
      type: 'confirm',
      name: 'enablePorts',
      message: 'Enable binding to ports 80 and 443 without sudo?',
      initial: true,
    })

    if (enablePorts) {
      const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()
      const setcapSpinner = ora(
        'Enabling Node.js to bind to privileged ports...',
      ).start()

      try {
        execSync(`sudo setcap 'cap_net_bind_service=+ep' "${nodePath}"`)
        setcapSpinner.succeed('Node.js can now bind to ports 80 and 443')

        console.log(
          chalk.green('\n✅ You can now run the proxy on standard ports:'),
        )
        console.log(chalk.gray('   arthack-proxy start'))
        console.log(chalk.gray('\n🔄 To remove this capability later:'))
        console.log(chalk.gray(`   sudo setcap -r ${nodePath}`))
      } catch (error) {
        setcapSpinner.fail('Failed to enable privileged port binding')
        console.log(
          chalk.yellow(
            "\n⏭️  Skipped. You'll need to use sudo or non-standard ports",
          ),
        )
      }
    }
  }

  if (!options.skipDns) {
    console.log('')
    const { setupDns } = await prompts({
      type: 'confirm',
      name: 'setupDns',
      message:
        'Set up wildcard DNS resolution for *.dev.localhost and *.dev.' +
        systemHostname +
        '?',
      initial: true,
    })

    if (setupDns) {
      console.log(chalk.cyan('\n🌐 Setting up DNS configuration...'))
      const { setupDnsCommand } = await import('./setup-dns.js')
      await setupDnsCommand({})
    }
  }

  console.log(chalk.green('\n✨ Setup complete! Start the proxy with:'))
  console.log(chalk.white('   arthack-proxy start'))
}

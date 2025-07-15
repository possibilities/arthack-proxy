import chalk from 'chalk'
import { execSync } from 'child_process'
import { hostname } from 'os'
import { existsSync } from 'fs'

function checkDnsResolution(domain: string): {
  success: boolean
  result: string
} {
  try {
    const result = execSync(`dig +short "${domain}" @127.0.0.1 2>/dev/null`, {
      encoding: 'utf-8',
    }).trim()
    return { success: result === '127.0.0.1', result }
  } catch {
    return { success: false, result: 'Failed to resolve' }
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

export async function checkDnsCommand() {
  const systemHostname = hostname()

  console.log(
    chalk.cyan('🔍 Checking DNS resolution for arthack-proxy domains...\n'),
  )

  if (isServiceActive('dnsmasq')) {
    console.log(chalk.green('✅ dnsmasq is running'))

    try {
      const pid = execSync('systemctl show -p MainPID dnsmasq | cut -d= -f2', {
        encoding: 'utf-8',
      }).trim()
      if (pid && pid !== '0') {
        const listenAddr = execSync(
          `sudo ss -tlnp | grep "pid=${pid}" | awk '{print $4}'`,
          { encoding: 'utf-8' },
        ).trim()
        if (listenAddr) {
          console.log(chalk.gray(`   Listening on: ${listenAddr}`))
        }
      }
    } catch {}
  } else if (isServiceActive('systemd-resolved')) {
    console.log(
      chalk.yellow('✅ systemd-resolved is running (limited wildcard support)'),
    )
  } else {
    console.log(chalk.red('❌ No DNS service is running'))
    console.log(chalk.gray('   Install dnsmasq: sudo apt install dnsmasq'))
  }

  console.log('')

  if (existsSync('/etc/dnsmasq.d/arthack-proxy.conf')) {
    console.log(chalk.green('✅ arthack-proxy.conf exists'))

    try {
      const content = execSync('cat /etc/dnsmasq.d/arthack-proxy.conf', {
        encoding: 'utf-8',
      })
      console.log(chalk.cyan('\n📄 Config contents:'))
      content.split('\n').forEach(line => {
        console.log(chalk.gray(`   ${line}`))
      })
    } catch {}
  } else {
    console.log(chalk.red('❌ /etc/dnsmasq.d/arthack-proxy.conf not found'))
    console.log(chalk.gray('   Run: arthack setup:certs'))
  }

  console.log(chalk.cyan('\n🌐 Testing DNS resolution:'))

  const testDomains = [
    'test.dev.localhost',
    'app.dev.localhost',
    'api.dev.localhost',
    `test.dev.${systemHostname}`,
    `app.dev.${systemHostname}`,
  ]

  testDomains.forEach(domain => {
    const { success, result } = checkDnsResolution(domain)
    if (success) {
      console.log(chalk.green(`✅ ${domain} → 127.0.0.1`))
    } else {
      console.log(chalk.red(`❌ ${domain} → ${result} (expected 127.0.0.1)`))
    }
  })

  console.log(chalk.gray('\n💡 Tip: If resolution fails, check:'))
  console.log(
    chalk.gray('   1. Is dnsmasq running? (sudo systemctl status dnsmasq)'),
  )
  console.log(
    chalk.gray('   2. Is 127.0.0.1 listed in /etc/resolv.conf as nameserver?'),
  )
  console.log(chalk.gray('   3. Try: dig test.dev.localhost @127.0.0.1'))
}

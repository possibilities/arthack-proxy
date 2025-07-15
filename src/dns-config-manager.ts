import { writeFileSync } from 'fs'
import { hostname } from 'os'

export class DnsConfigManager {
  private static readonly DNSMASQ_CONFIG_PATH =
    '/etc/dnsmasq.d/arthack-proxy.conf'

  static generateConfig(): string {
    const systemHostname = hostname()
    return `# Wildcard DNS for arthack-proxy
# Generated on ${new Date().toISOString()}

# Route all *.localhost to 127.0.0.1
address=/.localhost/127.0.0.1

# Route all *.${systemHostname} to 127.0.0.1
address=/.${systemHostname}/127.0.0.1
`
  }

  static async writeConfig(): Promise<void> {
    const config = this.generateConfig()
    try {
      writeFileSync(this.DNSMASQ_CONFIG_PATH, config, { mode: 0o644 })
      console.log(`✅ Wrote dnsmasq config to ${this.DNSMASQ_CONFIG_PATH}`)
    } catch (error) {
      throw new Error(`Failed to write dnsmasq config: ${error}`)
    }
  }
}

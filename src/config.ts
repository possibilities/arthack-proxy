export interface ProxyConfig {
  subdomainToPortMapping: Record<string, number>
  defaultPort?: number
  hostname?: string
}

export const defaultConfig: ProxyConfig = {
  subdomainToPortMapping: {
    tmux: 5232,
    claude: 5233,
    observer: 5233,
  },
}

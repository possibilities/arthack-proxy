import { execSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { hostname } from 'os'
import { join } from 'path'
import type { Logger, MappingChange } from './dynamic-config.js'

export class NginxSiteManager {
  private sitesDirectory: string
  private systemHostname: string
  private logger?: Logger

  constructor(sitesDirectory: string = './sites') {
    this.sitesDirectory = sitesDirectory
    this.systemHostname = hostname()
  }

  setLogger(logger: Logger) {
    this.logger = logger
  }

  private ensureSitesDirectory() {
    if (!existsSync(this.sitesDirectory)) {
      mkdirSync(this.sitesDirectory, { recursive: true })
      this.logger?.info(`Created sites directory at ${this.sitesDirectory}`)
    }
  }

  private generateServerBlock(
    serverName: string,
    subdomain: string,
    port: number,
    certPath: string,
    keyPath: string,
  ): string {
    return `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${serverName};
    
    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    access_log off;
    error_log /var/log/nginx/${subdomain}-error.log warn;
    
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Server $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_redirect http://localhost/ https://$host/;
        proxy_redirect http://127.0.0.1/ https://$host/;
        proxy_redirect https://localhost/ https://$host/;
        proxy_redirect https://127.0.0.1/ https://$host/;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
`
  }

  private generateSiteConfig(subdomain: string, port: number): string {
    const hostnameServerName = `${subdomain}.${this.systemHostname}`
    const localhostServerName = `${subdomain}.localhost`

    let config = ''

    config += this.generateServerBlock(
      hostnameServerName,
      subdomain,
      port,
      `/etc/nginx/ssl/${this.systemHostname}.crt`,
      `/etc/nginx/ssl/${this.systemHostname}.key`,
    )

    if (existsSync('/etc/nginx/ssl/localhost.crt')) {
      config +=
        '\n' +
        this.generateServerBlock(
          localhostServerName,
          subdomain,
          port,
          '/etc/nginx/ssl/localhost.crt',
          '/etc/nginx/ssl/localhost.key',
        )
    }

    return config
  }

  private reloadNginx() {
    try {
      execSync('sudo systemctl reload nginx', { stdio: 'pipe' })
      this.logger?.info('Successfully reloaded nginx')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      this.logger?.error({ error: errorMessage }, 'Failed to reload nginx')
    }
  }

  clearAllSites() {
    this.ensureSitesDirectory()

    const files = readdirSync(this.sitesDirectory)
    for (const file of files) {
      if (file.endsWith('.conf')) {
        const filePath = join(this.sitesDirectory, file)
        unlinkSync(filePath)
        this.logger?.debug({ file }, 'Removed site configuration')
      }
    }

    if (files.length > 0) {
      this.logger?.info(`Cleared ${files.length} site configurations`)
    }
  }

  applyMappingChanges(changes: MappingChange) {
    this.ensureSitesDirectory()

    let needsReload = false

    for (const [subdomain, port] of Object.entries(changes.added)) {
      const filename = `${subdomain}.conf`
      const filepath = join(this.sitesDirectory, filename)
      const config = this.generateSiteConfig(subdomain, port)

      writeFileSync(filepath, config)
      this.logger?.info(
        `Created nginx site: ${subdomain}.${this.systemHostname} → localhost:${port}`,
      )
      needsReload = true
    }

    for (const subdomain of changes.removed) {
      const filename = `${subdomain}.conf`
      const filepath = join(this.sitesDirectory, filename)

      if (existsSync(filepath)) {
        unlinkSync(filepath)
        this.logger?.info(
          `Removed nginx site: ${subdomain}.${this.systemHostname}`,
        )
        needsReload = true
      }
    }

    if (needsReload) {
      this.reloadNginx()
    }
  }

  syncAllMappings(mappings: Record<string, number>) {
    this.clearAllSites()

    if (Object.keys(mappings).length === 0) {
      return
    }

    const changes: MappingChange = {
      added: mappings,
      removed: [],
    }

    this.applyMappingChanges(changes)
  }
}

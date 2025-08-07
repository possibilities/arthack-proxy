import { exec } from 'child_process'
import { promisify } from 'util'
import { FastifyInstance } from 'fastify'

const executeCommand = promisify(exec)

const BROWSER_SUBDOMAIN_PREFIX = 'browser-'

export interface MappingChange {
  added: Record<string, number>
  removed: string[]
}

interface BrowserPort {
  host: string
  port: string
}

interface BrowserInfo {
  name: string
  status: 'running' | 'stopped'
  createdAt: string
  lastUsed: string
  ports?: Record<string, BrowserPort>
}

function escapeShellArg(arg: string): string {
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'"
}

function validateHost(host: string): void {
  if (!host || host.trim() !== host) {
    throw new Error('Invalid host: contains leading/trailing whitespace')
  }
  if (/[;&|<>$`\\]/.test(host)) {
    throw new Error('Invalid host: contains shell metacharacters')
  }
}

function validatePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

function constructSSHCommand(host: string, command: string): string {
  if (host === 'localhost') {
    return command
  }
  return `ssh ${escapeShellArg(host)} ${escapeShellArg(command)}`
}

export function isBrowserMapping(subdomain: string): boolean {
  return subdomain.startsWith(BROWSER_SUBDOMAIN_PREFIX)
}

export interface SubdomainInfo {
  port: number
  source: 'browser' | 'system' | 'general'
}

export class DynamicConfigManager {
  private currentMappings: Record<string, number> = {}
  private currentMappingsWithSource: Record<string, SubdomainInfo> = {}
  private pollInterval?: NodeJS.Timeout
  private logger?: FastifyInstance['log']
  private targetHost: string

  constructor(targetHost: string = 'localhost') {
    this.currentMappings = {}
    validateHost(targetHost)
    this.targetHost = targetHost
  }

  setLogger(logger: FastifyInstance['log']) {
    this.logger = logger
  }

  get subdomainToPortMapping(): Record<string, number> {
    return { ...this.currentMappings }
  }

  get subdomainMappingsWithSource(): Record<string, SubdomainInfo> {
    return { ...this.currentMappingsWithSource }
  }

  async testSSHConnection(): Promise<boolean> {
    if (this.targetHost === 'localhost') {
      return true
    }

    try {
      await executeCommand(
        `ssh -o ConnectTimeout=5 ${escapeShellArg(this.targetHost)} 'echo connected'`,
      )
      return true
    } catch (error) {
      this.logger?.error(
        { targetHost: this.targetHost, error },
        `SSH connection test failed to ${this.targetHost}`,
      )
      return false
    }
  }

  private buildTmuxCommand(
    serverSocket: string | null,
    command: string,
  ): string {
    const serverFlag = serverSocket ? `-L ${serverSocket}` : '-L default'
    return `tmux ${serverFlag} ${command}`
  }

  private cleanSessionName(sessionName: string): string {
    const sessionSuffixPattern = /^(.+)-session-(\d+)$/
    const worktreeSuffixPattern = /^(.+)-worktree-(\d+)$/

    const sessionMatch = sessionName.match(sessionSuffixPattern)
    if (sessionMatch) {
      const projectName = sessionMatch[1]
      const sessionNumber = sessionMatch[2]
      return sessionNumber === '00001'
        ? projectName
        : `${projectName}-${sessionNumber}`
    }

    const worktreeMatch = sessionName.match(worktreeSuffixPattern)
    if (worktreeMatch) {
      const projectName = worktreeMatch[1]
      const worktreeNumber = worktreeMatch[2]
      return `${projectName}-${worktreeNumber}`
    }

    return sessionName
  }

  async fetchSessionsFromServer(
    serverSocket: string | null,
    subdomainSuffix: string = '',
  ): Promise<Record<string, SubdomainInfo>> {
    const serverMappings: Record<string, SubdomainInfo> = {}
    const serverName = serverSocket || 'default'

    try {
      const listSessionsCommand = this.buildTmuxCommand(
        serverSocket,
        'list-sessions -F "#{session_name}"',
      )
      const remoteCommand = constructSSHCommand(
        this.targetHost,
        listSessionsCommand,
      )
      const { stdout: sessionsOutput } = await executeCommand(remoteCommand)

      const sessions = sessionsOutput
        .trim()
        .split('\n')
        .filter(line => line.length > 0)

      for (const sessionName of sessions) {
        try {
          const showEnvCommand = this.buildTmuxCommand(
            serverSocket,
            `show-environment -t "${sessionName}" PORT 2>/dev/null || true`,
          )
          const remoteEnvCommand = constructSSHCommand(
            this.targetHost,
            showEnvCommand,
          )
          const { stdout: portOutput } = await executeCommand(remoteEnvCommand)

          const portMatch = portOutput.match(/^PORT=(\d+)/)
          if (portMatch) {
            const port = parseInt(portMatch[1], 10)
            if (validatePort(port)) {
              const cleanedName = this.cleanSessionName(sessionName)
              const mappingKey = cleanedName + subdomainSuffix
              const source =
                subdomainSuffix === '.system' ? 'system' : 'general'
              serverMappings[mappingKey] = { port, source }
              this.logger?.debug(
                {
                  session: sessionName,
                  cleanedName,
                  port,
                  server: serverName,
                  mappingKey,
                },
                `Found PORT mapping for ${serverName} tmux session`,
              )
            } else {
              this.logger?.warn(
                { session: sessionName, port, server: serverName },
                `Invalid port number for ${serverName} tmux session`,
              )
            }
          } else {
            this.logger?.debug(
              { session: sessionName, server: serverName },
              `No PORT environment variable found for ${serverName} tmux session`,
            )
          }
        } catch (sessionError) {
          this.logger?.debug(
            { session: sessionName, error: sessionError, server: serverName },
            `Failed to get PORT for ${serverName} tmux session`,
          )
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      const isServerNotRunning =
        errorMessage.includes('no server running') ||
        errorMessage.includes('error connecting to') ||
        errorMessage.includes('No such file or directory')

      if (isServerNotRunning) {
        this.logger?.debug(
          { server: serverName },
          `No ${serverName} tmux server running`,
        )
      } else {
        this.logger?.error(
          {
            err: error,
            server: serverName,
            targetHost: this.targetHost,
          },
          `Failed to fetch sessions from ${serverName} tmux server`,
        )
      }
    }

    return serverMappings
  }

  async fetchBrowserSessions(): Promise<Record<string, SubdomainInfo>> {
    const browserMappings: Record<string, SubdomainInfo> = {}

    try {
      const command = constructSSHCommand(
        this.targetHost,
        'browser-composer list-browsers --json',
      )
      const { stdout } = await executeCommand(command)

      const browsers: BrowserInfo[] = JSON.parse(stdout)

      for (const browser of browsers) {
        if (browser.status === 'running' && browser.ports) {
          for (const [portName, portInfo] of Object.entries(browser.ports)) {
            if (
              portInfo &&
              typeof portInfo === 'object' &&
              'port' in portInfo
            ) {
              const port = parseInt(String(portInfo.port), 10)
              if (validatePort(port)) {
                const cleanedBrowserName = this.cleanSessionName(browser.name)
                const mappingKey = `${BROWSER_SUBDOMAIN_PREFIX}${portName}-${cleanedBrowserName}`
                browserMappings[mappingKey] = { port, source: 'browser' }
                this.logger?.debug(
                  {
                    browser: browser.name,
                    cleanedBrowserName,
                    portName,
                    port,
                    mappingKey,
                  },
                  'Found browser port mapping',
                )
              }
            }
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      const isBrowserComposerNotFound =
        errorMessage.includes('browser-composer: command not found') ||
        errorMessage.includes('browser-composer: not found') ||
        errorMessage.includes('No such module') ||
        errorMessage.includes('Could not resolve')

      if (isBrowserComposerNotFound) {
        this.logger?.debug(
          'browser-composer not installed, skipping browser discovery',
        )
      } else {
        this.logger?.debug(
          { err: error, targetHost: this.targetHost },
          'Failed to fetch browser sessions',
        )
      }
    }

    return browserMappings
  }

  async fetchTmuxSessions(): Promise<Record<string, SubdomainInfo>> {
    const defaultSessions = await this.fetchSessionsFromServer(null, '')
    const systemSessions = await this.fetchSessionsFromServer(
      'tmux-composer-system',
      '.system',
    )

    return { ...defaultSessions, ...systemSessions }
  }

  compareAndDetectChanges(
    newMappings: Record<string, SubdomainInfo>,
  ): MappingChange {
    const added: Record<string, number> = {}
    const removed: string[] = []

    for (const [subdomain, info] of Object.entries(newMappings)) {
      if (this.currentMappings[subdomain] !== info.port) {
        added[subdomain] = info.port
      }
    }

    for (const subdomain of Object.keys(this.currentMappings)) {
      if (!(subdomain in newMappings)) {
        removed.push(subdomain)
      }
    }

    return { added, removed }
  }

  async sendNotification(message: string) {
    try {
      await executeCommand(
        `notify-send -t 12000 "Proxy Mapping Update" ${escapeShellArg(message)}`,
      )
    } catch (error) {
      this.logger?.debug({ error, message }, 'notify-send not available')
    }
  }

  private async notifyAndLog(message: string, icon: string) {
    const fullMessage = `${icon} ${message}`
    await this.sendNotification(fullMessage)
    this.logger?.info(fullMessage)
  }

  async updateMappings(): Promise<boolean> {
    if (this.targetHost !== 'localhost') {
      const isConnected = await this.testSSHConnection()
      if (!isConnected) {
        this.logger?.warn(
          `Skipping session fetch due to SSH connection failure to ${this.targetHost}`,
        )
        return false
      }
    }

    const tmuxMappings = await this.fetchTmuxSessions()
    const browserMappings = await this.fetchBrowserSessions()
    const newMappingsWithSource = { ...tmuxMappings, ...browserMappings }
    const changes = this.compareAndDetectChanges(newMappingsWithSource)

    const hasChanges =
      Object.keys(changes.added).length > 0 || changes.removed.length > 0

    if (hasChanges) {
      const oldMappings = this.currentMappings
      this.currentMappingsWithSource = newMappingsWithSource
      this.currentMappings = Object.fromEntries(
        Object.entries(newMappingsWithSource).map(([k, v]) => [k, v.port]),
      )

      for (const [subdomain, port] of Object.entries(changes.added)) {
        const mappingMessage = `${subdomain} ──→ ${port}`
        const isBrowser = isBrowserMapping(subdomain)
        const icon = isBrowser ? '🖥️' : '🟢'
        const serverType = isBrowser ? 'browser' : 'server'
        await this.notifyAndLog(`New ${serverType}: ${mappingMessage}`, icon)
      }

      for (const subdomain of changes.removed) {
        const previousPort = oldMappings[subdomain]
        const removalMessage = previousPort
          ? `${subdomain} (was on port ${previousPort})`
          : subdomain
        const isBrowser = isBrowserMapping(subdomain)
        const serverType = isBrowser ? 'browser' : 'server'
        await this.notifyAndLog(
          `Removed ${serverType}: ${removalMessage}`,
          '🔴',
        )
      }

      this.logger?.info('Subdomain mappings updated:')
      for (const [subdomain, port] of Object.entries(this.currentMappings)) {
        this.logger?.info(`  ${subdomain} ──→ ${port}`)
      }
    }

    return hasChanges
  }

  startPolling(intervalMs: number = 3000) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }

    this.updateMappings()

    this.pollInterval = setInterval(() => {
      this.updateMappings()
    }, intervalMs)
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = undefined
    }
  }
}

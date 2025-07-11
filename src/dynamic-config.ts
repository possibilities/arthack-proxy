import { exec } from 'child_process'
import { promisify } from 'util'
import { FastifyInstance } from 'fastify'

const execAsync = promisify(exec)

export interface MappingChange {
  added: Record<string, number>
  removed: string[]
}

export class DynamicConfigManager {
  private currentMappings: Record<string, number> = {}
  private pollInterval?: NodeJS.Timeout
  private logger?: FastifyInstance['log']

  constructor() {
    this.currentMappings = {}
  }

  setLogger(logger: FastifyInstance['log']) {
    this.logger = logger
  }

  get subdomainToPortMapping(): Record<string, number> {
    return { ...this.currentMappings }
  }

  async fetchTmuxSessions(): Promise<Record<string, number>> {
    const newMappings: Record<string, number> = {}

    try {
      const { stdout: sessionsOutput } = await execAsync(
        'tmux -L tmux-composer-system list-sessions -F "#{session_name}"',
      )

      const sessions = sessionsOutput
        .trim()
        .split('\n')
        .filter(line => line.length > 0)

      for (const sessionName of sessions) {
        try {
          const { stdout: portOutput } = await execAsync(
            `tmux -L tmux-composer-system show-environment -t "${sessionName}" PORT 2>/dev/null || true`,
          )

          const portMatch = portOutput.match(/^PORT=(\d+)/)
          if (portMatch) {
            const port = parseInt(portMatch[1], 10)
            newMappings[sessionName] = port
            this.logger?.debug(
              { session: sessionName, port },
              'Found PORT mapping for tmux session',
            )
          } else {
            this.logger?.debug(
              { session: sessionName },
              'No PORT environment variable found for tmux session',
            )
          }
        } catch (sessionError) {
          this.logger?.debug(
            { session: sessionName, error: sessionError },
            'Failed to get PORT for tmux session',
          )
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      this.logger?.error(
        { err: error, message: errorMessage, stack: errorStack },
        'Failed to fetch tmux sessions',
      )
    }

    return newMappings
  }

  detectChanges(newMappings: Record<string, number>): MappingChange {
    const added: Record<string, number> = {}
    const removed: string[] = []

    // Find added or changed mappings
    for (const [subdomain, port] of Object.entries(newMappings)) {
      if (this.currentMappings[subdomain] !== port) {
        added[subdomain] = port
      }
    }

    // Find removed mappings
    for (const subdomain of Object.keys(this.currentMappings)) {
      if (!(subdomain in newMappings)) {
        removed.push(subdomain)
      }
    }

    return { added, removed }
  }

  async sendNotification(message: string) {
    try {
      await execAsync(
        `notify-send -t 12000 "Proxy Mapping Update" "${message}"`,
      )
    } catch (error) {
      this.logger?.error({ error, message }, 'Failed to send notification')
    }
  }

  async updateMappings(): Promise<boolean> {
    const newMappings = await this.fetchTmuxSessions()
    const changes = this.detectChanges(newMappings)

    const hasChanges =
      Object.keys(changes.added).length > 0 || changes.removed.length > 0

    if (hasChanges) {
      const oldMappings = this.currentMappings
      this.currentMappings = newMappings

      // Send notifications and log changes to terminal
      for (const [subdomain, port] of Object.entries(changes.added)) {
        const mappingMessage = `${subdomain} ──→ ${port}`
        await this.sendNotification(`🟢 New server: ${mappingMessage}`)
        this.logger?.info(`🟢 Server added: ${mappingMessage}`)
      }

      for (const subdomain of changes.removed) {
        const previousPort = oldMappings[subdomain]
        const removalMessage = previousPort
          ? `${subdomain} (was on port ${previousPort})`
          : subdomain
        await this.sendNotification(`🔴 Server removed: ${removalMessage}`)
        this.logger?.info(`🔴 Server removed: ${removalMessage}`)
      }

      // Log full mapping to console
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

    // Initial update
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

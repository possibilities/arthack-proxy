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

  constructor(initialMappings: Record<string, number> = {}) {
    this.currentMappings = { ...initialMappings }
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
          }
        } catch {
          // Session might not have PORT set, skip it
        }
      }
    } catch (error) {
      this.logger?.error('Failed to fetch tmux sessions:', error)
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
      await execAsync(`notify-send "Proxy Mapping Update" "${message}"`)
    } catch {
      // Ignore notification errors
    }
  }

  async updateMappings(): Promise<boolean> {
    const newMappings = await this.fetchTmuxSessions()
    const changes = this.detectChanges(newMappings)

    const hasChanges =
      Object.keys(changes.added).length > 0 || changes.removed.length > 0

    if (hasChanges) {
      this.currentMappings = newMappings

      // Send notifications for changes
      for (const [subdomain, port] of Object.entries(changes.added)) {
        await this.sendNotification(
          `🟢 New server: ${subdomain} → localhost:${port}`,
        )
      }

      for (const subdomain of changes.removed) {
        await this.sendNotification(`🔴 Server removed: ${subdomain}`)
      }

      // Log full mapping to console
      this.logger?.info('Subdomain mappings updated:', this.currentMappings)
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

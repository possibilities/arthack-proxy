import { DynamicConfigManager } from './dynamic-config.js'

const configManager = new DynamicConfigManager()

const simpleLogger = {
  info: (message: string | Record<string, any>, ...args: any[]) => {
    if (typeof message === 'string') {
      console.log(`[INFO] ${message}`, ...args)
    } else {
      console.log('[INFO]', message)
    }
  },
  debug: (message: Record<string, any>, description?: string) => {
    if (description) {
      console.debug(`[DEBUG] ${description}`, message)
    } else {
      console.debug('[DEBUG]', message)
    }
  },
  error: (message: Record<string, any>, description?: string) => {
    if (description) {
      console.error(`[ERROR] ${description}`, message)
    } else {
      console.error('[ERROR]', message)
    }
  },
}

configManager.setLogger(simpleLogger as any)

console.log('Starting service discovery...')
configManager.startPolling(3000)
console.log('Started polling tmux sessions for mapping updates')

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...')
  configManager.stopPolling()
  console.log('Stopped polling tmux sessions')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...')
  configManager.stopPolling()
  console.log('Stopped polling tmux sessions')
  process.exit(0)
})

import { DynamicConfigManager } from './dynamic-config.js'
import { createConsoleLogger } from './console-logger.js'

const configManager = new DynamicConfigManager()
configManager.setLogger(createConsoleLogger())

console.log('Starting service discovery...')
configManager.startPolling(3000)
console.log('Started polling tmux sessions for mapping updates')

const handleShutdown = (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`)
  configManager.stopPolling()
  console.log('Stopped polling tmux sessions')
  process.exit(0)
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))

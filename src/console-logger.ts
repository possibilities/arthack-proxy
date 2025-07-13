import { Logger } from './dynamic-config.js'

export const createConsoleLogger = (): Logger => ({
  info: (messageOrRecord, ...additionalArgs) => {
    if (typeof messageOrRecord === 'string') {
      console.log(`[INFO] ${messageOrRecord}`, ...additionalArgs)
    } else {
      console.log('[INFO]', messageOrRecord)
    }
  },
  debug: (record, description) => {
    if (description) {
      console.debug(`[DEBUG] ${description}`, record)
    } else {
      console.debug('[DEBUG]', record)
    }
  },
  error: (record, description) => {
    if (description) {
      console.error(`[ERROR] ${description}`, record)
    } else {
      console.error('[ERROR]', record)
    }
  },
})

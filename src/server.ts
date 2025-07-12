import replyFrom from '@fastify/reply-from'
import { DynamicConfigManager } from './dynamic-config.js'

function extractSubdomainAndPort(
  hostname: string,
  configManager: DynamicConfigManager,
): { subdomain: string | null; port: number | null } {
  const subdomainMatch = hostname.match(/^([^.]+)\./)
  if (!subdomainMatch) {
    return { subdomain: null, port: null }
  }

  const subdomain = subdomainMatch[1]
  const port = configManager.subdomainToPortMapping[subdomain] || null
  return { subdomain, port }
}

export default async function app(fastify: any, _opts: any) {
  const configManager = new DynamicConfigManager()

  configManager.setLogger(fastify.log)

  await fastify.register(replyFrom)

  fastify.all('/*', async (incomingRequest: any, proxyReply: any) => {
    const requestHostname = incomingRequest.hostname
    const { subdomain, port } = extractSubdomainAndPort(
      requestHostname,
      configManager,
    )

    if (!subdomain) {
      return proxyReply.code(404).send({
        error: 'Not Found',
        message: 'No subdomain specified in the request',
        hostname: requestHostname,
      })
    }

    if (!port) {
      return proxyReply.code(503).send({
        error: 'Service Unavailable',
        message: `No service found for subdomain: ${subdomain}`,
        subdomain,
        availableSubdomains: Object.keys(configManager.subdomainToPortMapping),
      })
    }

    const targetUrl = `http://localhost:${port}`
    fastify.log.info(`Proxying ${requestHostname} -> ${targetUrl}`)

    return proxyReply.from(targetUrl + incomingRequest.url, {
      rewriteRequestHeaders: (_req: any, headers: any) => {
        return {
          ...headers,
          host: `localhost:${port}`,
        }
      },
    })
  })

  fastify.addHook('onReady', async () => {
    configManager.startPolling(3000)
    fastify.log.info('Started polling tmux sessions for mapping updates')
  })

  fastify.addHook('onClose', async () => {
    configManager.stopPolling()
    fastify.log.info('Stopped polling tmux sessions')
  })

  fastify.addHook('onError', async (request: any, _reply: any, error: any) => {
    fastify.log.error(
      {
        err: error,
        url: request.url,
        hostname: request.hostname,
        method: request.method,
      },
      'Proxy error occurred',
    )
  })
}

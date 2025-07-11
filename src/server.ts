import fastify from 'fastify'
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

export async function createProxyServer() {
  const configManager = new DynamicConfigManager()

  const server = fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
  })

  configManager.setLogger(server.log)

  await server.register(replyFrom)

  server.all('/*', async (incomingRequest: any, proxyReply: any) => {
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
    server.log.info(`Proxying ${requestHostname} -> ${targetUrl}`)

    return proxyReply.from(targetUrl + incomingRequest.url, {
      rewriteRequestHeaders: (_req: any, headers: any) => {
        return {
          ...headers,
          host: `localhost:${port}`,
        }
      },
    })
  })

  server.addHook('onReady', async () => {
    configManager.startPolling(3000)
    server.log.info('Started polling tmux sessions for mapping updates')
  })

  server.addHook('onClose', async () => {
    configManager.stopPolling()
    server.log.info('Stopped polling tmux sessions')
  })

  server.addHook('onError', async (request, _reply, error) => {
    server.log.error(
      {
        err: error,
        url: request.url,
        hostname: request.hostname,
        method: request.method,
      },
      'Proxy error occurred',
    )
  })

  return server
}

export async function startProxyServer(
  port: number = 80,
  host: string = '0.0.0.0',
) {
  const server = await createProxyServer()

  try {
    await server.listen({ port, host })
    server.log.info(`Proxy server listening on ${host}:${port}`)
    return server
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

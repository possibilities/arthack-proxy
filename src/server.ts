import fastify from 'fastify'
import httpProxy from '@fastify/http-proxy'
import { ProxyConfig, defaultConfig } from './config.js'
import { DynamicConfigManager } from './dynamic-config.js'

const INVALID_PORT = 9999999

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

export async function createProxyServer(config: ProxyConfig = defaultConfig) {
  const configManager = new DynamicConfigManager(config.subdomainToPortMapping)

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

  await server.register(httpProxy, {
    upstream: 'http://localhost',
    prefix: '/',
    replyOptions: {
      rewriteRequestHeaders: (_request: any, headers: any) => {
        const { port } = extractSubdomainAndPort(
          _request.hostname,
          configManager,
        )

        if (port) {
          return {
            ...headers,
            host: `localhost:${port}`,
          }
        }

        return headers
      },
      getUpstream: (request: any) => {
        const hostname = request.hostname
        const { subdomain, port } = extractSubdomainAndPort(
          hostname,
          configManager,
        )

        if (!subdomain) {
          server.log.warn(`No subdomain found in hostname: ${hostname}`)
          return `http://localhost:${INVALID_PORT}`
        }

        if (!port) {
          server.log.warn(`No mapping found for subdomain: ${subdomain}`)
          return `http://localhost:${INVALID_PORT}`
        }

        const targetUrl = `http://localhost:${port}`
        server.log.info(`Proxying ${hostname} -> ${targetUrl}`)

        return targetUrl
      },
    },
  })

  server.addHook('onReady', async () => {
    configManager.startPolling(3000)
    server.log.info('Started polling tmux sessions for mapping updates')
  })

  server.addHook('onClose', async () => {
    configManager.stopPolling()
    server.log.info('Stopped polling tmux sessions')
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

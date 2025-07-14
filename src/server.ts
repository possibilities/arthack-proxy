import replyFrom from '@fastify/reply-from'
import httpProxy from 'http-proxy'
import { IncomingMessage, IncomingHttpHeaders } from 'http'
import * as net from 'net'
import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
  FastifyError,
} from 'fastify'
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

export default async function app(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  const configManager = new DynamicConfigManager()

  const wsProxy = httpProxy.createProxyServer({})

  wsProxy.on('error', (err: Error) => {
    fastify.log.error({ err }, 'WebSocket proxy error')
  })

  configManager.setLogger(fastify.log)

  await fastify.register(replyFrom)

  fastify.server.on(
    'upgrade',
    (req: IncomingMessage, socket: net.Socket, head: Buffer) => {
      const hostHeader = req.headers.host || ''
      const hostname = hostHeader.split(':')[0]
      const { subdomain, port } = extractSubdomainAndPort(
        hostname,
        configManager,
      )

      if (!subdomain) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }

      if (!port) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
        socket.destroy()
        return
      }

      const targetUrl = `ws://localhost:${port}`
      fastify.log.info(`WebSocket proxying ${hostname} -> ${targetUrl}`)

      req.headers.host = `localhost:${port}`
      wsProxy.ws(req, socket, head, { target: targetUrl })
    },
  )

  fastify.all(
    '/*',
    async (incomingRequest: FastifyRequest, proxyReply: FastifyReply) => {
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
          availableSubdomains: Object.keys(
            configManager.subdomainToPortMapping,
          ),
        })
      }

      const targetUrl = `http://localhost:${port}`
      fastify.log.info(`Proxying ${requestHostname} -> ${targetUrl}`)

      return proxyReply.from(targetUrl + incomingRequest.url, {
        rewriteRequestHeaders: (_req, headers) => {
          const newHeaders: IncomingHttpHeaders = {
            ...headers,
            host: `localhost:${port}`,
          }

          if (headers.referer) {
            try {
              const refererUrl = new URL(headers.referer)
              refererUrl.host = `localhost:${port}`
              newHeaders.referer = refererUrl.toString()
            } catch {}
          }

          if (headers.origin) {
            try {
              const originUrl = new URL(headers.origin)
              originUrl.host = `localhost:${port}`
              newHeaders.origin = originUrl.toString()
            } catch {}
          }

          return newHeaders
        },
      })
    },
  )

  fastify.addHook('onReady', async () => {
    configManager.startPolling(3000)
    fastify.log.info('Started polling tmux sessions for mapping updates')
  })

  fastify.addHook('onClose', async () => {
    configManager.stopPolling()
    fastify.log.info('Stopped polling tmux sessions')
  })

  fastify.addHook(
    'onError',
    async (
      request: FastifyRequest,
      _reply: FastifyReply,
      error: FastifyError,
    ) => {
      fastify.log.error(
        {
          err: error,
          url: request.url,
          hostname: request.hostname,
          method: request.method,
        },
        'Proxy error occurred',
      )
    },
  )
}

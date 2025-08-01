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
import { CertificateManager } from './cert-manager.js'
import { generateErrorPage, generateNotFoundPage } from './error-page.js'

function extractSubdomainAndPort(
  hostname: string,
  configManager: DynamicConfigManager,
): { subdomain: string | null; port: number | null } {
  const systemHostnameMatch = hostname.match(/^([^.]+)\.system\.dev\./)
  if (systemHostnameMatch) {
    const subdomainWithSystemSuffix = `${systemHostnameMatch[1]}.system`
    const port =
      configManager.subdomainToPortMapping[subdomainWithSystemSuffix] || null
    return { subdomain: subdomainWithSystemSuffix, port }
  }

  const standardSubdomainMatch = hostname.match(/^([^.]+)\./)
  if (!standardSubdomainMatch) {
    return { subdomain: null, port: null }
  }

  const subdomain = standardSubdomainMatch[1]
  const port = configManager.subdomainToPortMapping[subdomain] || null
  return { subdomain, port }
}

function rewriteUrlHeader(
  headerValue: string | undefined,
  targetHost: string,
  targetPort: number,
): string | undefined {
  if (!headerValue) return headerValue

  try {
    const url = new URL(headerValue)
    url.host = `${targetHost}:${targetPort}`
    return url.toString()
  } catch {
    return headerValue
  }
}

interface AppOptions extends FastifyPluginOptions {
  isHttps?: boolean
  targetHost?: string
}

export default async function app(fastify: FastifyInstance, opts: AppOptions) {
  const targetHost = opts.targetHost || 'localhost'
  const configManager = new DynamicConfigManager(targetHost)
  const certManager = new CertificateManager()

  const isHttps = opts.isHttps === true
  const protocol = isHttps ? 'https' : 'http'

  const webSocketProxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
  })

  webSocketProxy.on('error', (err: Error) => {
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

      const targetUrl = `ws://${targetHost}:${port}`
      fastify.log.info(
        `WebSocket proxying ${protocol}://${hostname} -> ${targetUrl}`,
      )

      req.headers.host = `${targetHost}:${port}`
      webSocketProxy.ws(req, socket, head, { target: targetUrl })
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

      const wantsBrowserResponse = (
        incomingRequest.headers.accept || ''
      ).includes('text/html')

      if (!subdomain) {
        if (wantsBrowserResponse) {
          return proxyReply
            .code(404)
            .type('text/html')
            .send(generateNotFoundPage(requestHostname))
        }

        return proxyReply.code(404).send({
          error: 'Not Found',
          message: 'No subdomain specified in the request',
          hostname: requestHostname,
        })
      }

      if (!port) {
        if (wantsBrowserResponse) {
          return proxyReply
            .code(503)
            .type('text/html')
            .send(
              generateErrorPage(
                subdomain,
                Object.keys(configManager.subdomainToPortMapping),
                requestHostname,
                protocol,
              ),
            )
        }

        return proxyReply.code(503).send({
          error: 'Service Unavailable',
          message: `No service found for subdomain: ${subdomain}`,
          subdomain,
          availableSubdomains: Object.keys(
            configManager.subdomainToPortMapping,
          ),
        })
      }

      const targetUrl = `http://${targetHost}:${port}`
      fastify.log.info(
        `Proxying ${protocol}://${requestHostname} -> ${targetUrl}`,
      )

      return proxyReply.from(targetUrl + incomingRequest.url, {
        rewriteRequestHeaders: (_req, headers) => {
          const newHeaders: IncomingHttpHeaders = {
            ...headers,
            host: `${targetHost}:${port}`,
          }

          newHeaders.referer = rewriteUrlHeader(
            headers.referer,
            targetHost,
            port,
          )
          newHeaders.origin = rewriteUrlHeader(headers.origin, targetHost, port)

          return newHeaders
        },
      })
    },
  )

  fastify.addHook('onReady', async () => {
    configManager.startPolling(3000)
    fastify.log.info('Started polling tmux sessions for mapping updates')
    fastify.log.info(`Proxying to target host: ${targetHost}`)

    if (isHttps) {
      fastify.log.info('🔐 HTTPS enabled with local certificates')
    } else if (certManager.hasCertificates()) {
      const paths = certManager.getCertificatePaths()
      fastify.log.info('📜 Certificates found but HTTPS not enabled')
      fastify.log.info(
        `   To enable HTTPS, the server needs to be started with certificate configuration`,
      )
      fastify.log.info(`   Certificates available at:`)
      fastify.log.info(`   - ${paths.cert}`)
      fastify.log.info(`   - ${paths.key}`)
    } else {
      fastify.log.info('💡 To enable HTTPS, run: arthack-proxy setup:certs')
    }
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

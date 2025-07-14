import Fastify from 'fastify'
import { CertificateManager } from './cert-manager.js'
import app from './server.js'

async function start() {
  const certManager = new CertificateManager()
  const certificateConfig = certManager.getCertificateConfig()

  const fastifyOptions: any = {
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  }

  if (certificateConfig) {
    fastifyOptions.https = certificateConfig
    console.log('\ud83d\udd10 Starting server with HTTPS enabled')
  } else {
    console.log('\ud83d\udce1 Starting server with HTTP only')
    console.log('\ud83d\udca1 Run "npm run setup:certs" to enable HTTPS')
  }

  const server = Fastify(fastifyOptions)

  await server.register(app, { isHttps: !!certificateConfig })

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  const host = process.env.HOST || '0.0.0.0'

  try {
    await server.listen({ port, host })
    const protocol = certificateConfig ? 'https' : 'http'
    console.log(
      `\ud83d\ude80 Server listening on ${protocol}://${host}:${port}`,
    )
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()

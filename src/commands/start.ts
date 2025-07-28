import chalk from 'chalk'
import ora from 'ora'
import { hostname } from 'os'
import Fastify from 'fastify'
import { CertificateManager } from '../cert-manager.js'
import app from '../server.js'

interface StartOptions {
  port: number
  host: string
  httpPort: number
  https: boolean
  targetHost: string
}

export async function startCommand(options: StartOptions) {
  const certManager = new CertificateManager()
  const certificateConfig = certManager.getCertificateConfig()
  const systemHostname = hostname()

  const loggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }

  const useHttps = options.https && certificateConfig !== null
  const httpsPort = options.port
  const httpPort = options.httpPort
  const bindHost = options.host

  if (useHttps) {
    console.log(chalk.cyan('🔐 Starting servers with HTTPS enabled'))

    const httpRedirectServer = Fastify({ logger: loggerConfig })

    httpRedirectServer.all('/*', async (request, reply) => {
      const httpsUrl = `https://${request.hostname}${request.url}`
      return reply.code(301).redirect(httpsUrl)
    })

    const httpsServer = Fastify({
      logger: loggerConfig,
      https: certificateConfig,
    })

    await httpsServer.register(app, {
      isHttps: true,
      targetHost: options.targetHost,
    })

    try {
      const httpSpinner = ora('Starting HTTP redirect server...').start()
      await httpRedirectServer.listen({ port: httpPort, host: bindHost })
      httpSpinner.succeed(`HTTP redirect server listening on port ${httpPort}`)

      const httpsSpinner = ora('Starting HTTPS server...').start()
      await httpsServer.listen({ port: httpsPort, host: bindHost })
      httpsSpinner.succeed(`HTTPS server listening on port ${httpsPort}`)

      console.log('')
      console.log(chalk.green('🚀 Servers running:'))
      console.log(
        chalk.gray(`   📡 HTTP  on port ${httpPort}  → redirects to HTTPS`),
      )
      console.log(chalk.gray(`   🔐 HTTPS on port ${httpsPort}`))
      console.log(chalk.gray(`   🎯 Proxying to ${options.targetHost}`))
      console.log('')
      console.log(chalk.cyan('🌐 Access your services at:'))
      console.log(chalk.white(`   https://subdomain.dev.localhost`))
      console.log(chalk.white(`   https://subdomain.dev.${systemHostname}`))
      console.log(chalk.white(`   https://subdomain.system.dev.localhost`))
      console.log(
        chalk.white(`   https://subdomain.system.dev.${systemHostname}`),
      )
    } catch (err) {
      if ((err as any).code === 'EACCES') {
        console.error(chalk.red('❌ Permission denied binding to ports'))
        console.error(
          chalk.yellow(
            '   Run: arthack-proxy setup:certs (and enable port binding)',
          ),
        )
        console.error(chalk.yellow('   Or run with: sudo arthack-proxy start'))
      } else {
        console.error(chalk.red('❌ Failed to start servers:'), err)
      }
      process.exit(1)
    }
  } else {
    if (!certificateConfig) {
      console.log(
        chalk.yellow('📡 Starting HTTP server (no certificates found)'),
      )
      console.log(
        chalk.gray('💡 Run "arthack-proxy setup:certs" to enable HTTPS'),
      )
    } else {
      console.log(
        chalk.yellow('📡 Starting HTTP-only server (--no-https flag)'),
      )
    }

    const httpServer = Fastify({ logger: loggerConfig })
    await httpServer.register(app, {
      isHttps: false,
      targetHost: options.targetHost,
    })

    try {
      const spinner = ora('Starting HTTP server...').start()
      await httpServer.listen({ port: httpPort, host: bindHost })
      spinner.succeed(`HTTP server listening on port ${httpPort}`)

      console.log('')
      console.log(chalk.green('🚀 Server running:'))
      console.log(chalk.gray(`   📡 HTTP on port ${httpPort}`))
      console.log(chalk.gray(`   🎯 Proxying to ${options.targetHost}`))
      console.log('')
      console.log(chalk.cyan('🌐 Access your services at:'))
      console.log(chalk.white(`   http://subdomain.dev.localhost:${httpPort}`))
      console.log(
        chalk.white(`   http://subdomain.dev.${systemHostname}:${httpPort}`),
      )
      console.log(
        chalk.white(`   http://subdomain.system.dev.localhost:${httpPort}`),
      )
      console.log(
        chalk.white(
          `   http://subdomain.system.dev.${systemHostname}:${httpPort}`,
        ),
      )
    } catch (err) {
      if ((err as any).code === 'EACCES') {
        console.error(chalk.red('❌ Permission denied binding to port'))
        console.error(
          chalk.yellow(
            '   Run: arthack-proxy setup:certs (and enable port binding)',
          ),
        )
        console.error(chalk.yellow('   Or run with: sudo arthack-proxy start'))
      } else {
        console.error(chalk.red('❌ Failed to start server:'), err)
      }
      process.exit(1)
    }
  }
}

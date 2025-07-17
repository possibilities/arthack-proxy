import { homedir } from 'os'
import { join } from 'path'

export function getConfigDirectory(): string {
  return join(homedir(), '.arthack-proxy')
}

export function getCertsDirectory(): string {
  return join(getConfigDirectory(), 'certs')
}

export function getCertificatePaths(): { cert: string; key: string } {
  const certsDir = getCertsDirectory()
  return {
    cert: join(certsDir, 'cert.pem'),
    key: join(certsDir, 'key.pem'),
  }
}

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const currentModuleUrl = import.meta.url
const currentModulePath = fileURLToPath(currentModuleUrl)
const currentDirectory = dirname(currentModulePath)
const projectRoot = dirname(currentDirectory)

export interface CertificateConfig {
  key: Buffer
  cert: Buffer
}

export class CertificateManager {
  private certificatePath: string
  private keyPath: string

  constructor() {
    const certsDirectory = join(projectRoot, 'certs')
    this.certificatePath = join(certsDirectory, 'cert.pem')
    this.keyPath = join(certsDirectory, 'key.pem')
  }

  hasCertificates(): boolean {
    return existsSync(this.certificatePath) && existsSync(this.keyPath)
  }

  getCertificateConfig(): CertificateConfig | null {
    if (!this.hasCertificates()) {
      return null
    }

    try {
      const key = readFileSync(this.keyPath)
      const cert = readFileSync(this.certificatePath)
      return { key, cert }
    } catch (error) {
      console.error('Failed to read certificate files:', error)
      return null
    }
  }

  getCertificatePaths(): { cert: string; key: string } {
    return {
      cert: this.certificatePath,
      key: this.keyPath,
    }
  }
}

import { readFileSync, existsSync } from 'fs'
import { getCertificatePaths } from './config-paths.js'

export interface CertificateConfig {
  key: Buffer
  cert: Buffer
}

export class CertificateManager {
  private certificatePath: string
  private keyPath: string

  constructor() {
    const paths = getCertificatePaths()
    this.certificatePath = paths.cert
    this.keyPath = paths.key
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

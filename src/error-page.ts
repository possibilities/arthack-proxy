function constructServiceUrl(
  subdomain: string,
  hostname: string,
  protocol: string,
): string {
  if (subdomain.endsWith('.system')) {
    const baseDomain = hostname.replace(/^[^.]+\./, '')
    const baseSubdomain = subdomain.replace('.system', '')
    return `${protocol}://${baseSubdomain}.system.${baseDomain}`
  }

  return `${protocol}://${subdomain}.${hostname}`
}

import { SubdomainInfo } from './dynamic-config.js'

export function generateErrorPage(
  subdomain: string,
  availableSubdomains: Record<string, SubdomainInfo>,
  hostname: string,
  protocol: string,
): string {
  const generalServices = Object.entries(availableSubdomains)
    .filter(([_, info]) => info.source === 'general')
    .map(([sub, _]) => sub)
  const browserServices = Object.entries(availableSubdomains)
    .filter(([_, info]) => info.source === 'browser')
    .map(([sub, _]) => sub)
  const systemServices = Object.entries(availableSubdomains)
    .filter(([_, info]) => info.source === 'system')
    .map(([sub, _]) => sub)
  const createLinks = (services: string[]) =>
    services
      .map(sub => {
        const url = constructServiceUrl(sub, hostname, protocol)
        return `  <a href="${url}">${url}</a>`
      })
      .join('\n')

  const generalLinks = createLinks(generalServices)
  const browserLinks = createLinks(browserServices)
  const systemLinks = createLinks(systemServices)
  let availableServicesSection = ''

  if (generalServices.length > 0) {
    availableServicesSection += `General services:
${generalLinks}

`
  }

  if (browserServices.length > 0) {
    availableServicesSection += `Browser services:
${browserLinks}

`
  }

  if (systemServices.length > 0) {
    availableServicesSection += `System services:
${systemLinks}

`
  }

  if (availableServicesSection === '') {
    availableServicesSection = 'No services available\n\n'
  }

  return `<!DOCTYPE html>
<html>
<head>
<title>503 Service Unavailable</title>
<style>
body {
  background: #000;
  color: #0f0;
  font-family: monospace;
  padding: 20px;
  line-height: 1.6;
}
a {
  color: #0ff;
}
a:hover {
  color: #fff;
}
</style>
</head>
<body>
<pre>
503 Service Unavailable

No service found for subdomain: ${subdomain}

${availableServicesSection}To start a service:
- Run service in tmux session named '${subdomain}'
- Service must set PORT environment variable
</pre>
</body>
</html>`
}

export function generateNotFoundPage(hostname: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<title>404 Not Found</title>
<style>
body {
  background: #000;
  color: #0f0;
  font-family: monospace;
  padding: 20px;
  line-height: 1.6;
}
</style>
</head>
<body>
<pre>
404 Not Found

No subdomain specified in request: ${hostname}

Usage:
  https://myapp.dev.localhost
  https://api.system.localhost
  https://backend.dev.${hostname}

Subdomain maps to tmux session name.
</pre>
</body>
</html>`
}

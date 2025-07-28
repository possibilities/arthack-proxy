function constructServiceUrl(
  subdomain: string,
  hostname: string,
  protocol: string,
): string {
  if (subdomain.endsWith('.system')) {
    const baseSubdomain = subdomain.replace('.system', '')
    const hostWithoutFirstSegment = hostname.split('.').slice(1).join('.')
    const hostWithoutSystemPrefix = hostWithoutFirstSegment.replace(
      /^system\./,
      '',
    )
    return `${protocol}://${baseSubdomain}.system.${hostWithoutSystemPrefix}`
  }

  const hostWithoutFirstSegment = hostname.split('.').slice(1).join('.')
  return `${protocol}://${subdomain}.${hostWithoutFirstSegment}`
}

export function generateErrorPage(
  subdomain: string,
  availableSubdomains: string[],
  hostname: string,
  protocol: string,
): string {
  const suggestedLinks = availableSubdomains
    .map(sub => {
      const url = constructServiceUrl(sub, hostname, protocol)
      return `<a href="${url}">${url}</a>`
    })
    .join('\n')

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

Available services:
${availableSubdomains.length > 0 ? suggestedLinks : 'None'}

To start a service:
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
  https://api.system.dev.localhost
  https://backend.dev.${hostname}

Subdomain maps to tmux session name.
</pre>
</body>
</html>`
}

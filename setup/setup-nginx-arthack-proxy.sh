#!/bin/bash

set -e

echo "=== Configuring nginx for arthack-proxy ==="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

HOSTNAME=$(hostname)

# Check if SSL certificates exist
if [ ! -f "/etc/nginx/ssl/$HOSTNAME.crt" ] || [ ! -f "/etc/nginx/ssl/$HOSTNAME.key" ]; then
    echo "ERROR: SSL certificates not found at /etc/nginx/ssl/"
    echo "Please set up certificates using the dotfiles setup first."
    echo "Expected files:"
    echo "  - /etc/nginx/ssl/$HOSTNAME.crt"
    echo "  - /etc/nginx/ssl/$HOSTNAME.key"
    exit 1
fi

echo "Creating nginx configuration..."

# Generate nginx configuration from template
sed -e "s|PROJECT_DIR|$PROJECT_DIR|g" \
    -e "s|HOSTNAME|$HOSTNAME|g" \
    "$SCRIPT_DIR/arthack-proxy.conf.template" | \
    sudo tee /etc/nginx/sites-available/arthack-proxy > /dev/null

if [ -L /etc/nginx/sites-enabled/port-forward-ssl ] || [ -L /etc/nginx/sites-enabled/port-forward ]; then
    echo "Disabling old port-forward configuration..."
    sudo rm -f /etc/nginx/sites-enabled/port-forward-ssl
    sudo rm -f /etc/nginx/sites-enabled/port-forward
fi

if [ -L /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    echo "Disabled default nginx site"
fi

sudo ln -sf /etc/nginx/sites-available/arthack-proxy /etc/nginx/sites-enabled/arthack-proxy

echo "Testing nginx configuration..."
if sudo nginx -t; then
    echo "✓ Nginx configuration is valid"
else
    echo "✗ Nginx configuration is invalid"
    exit 1
fi

sudo systemctl reload nginx

echo ""
echo "=== arthack-proxy nginx Setup Complete ==="
HOSTNAME=$(hostname)

echo ""
echo "Nginx is now configured to:"
echo "  - Return 444 (connection closed) for unmatched requests"
echo "  - Load site configurations from $PROJECT_DIR/sites/*.conf"
echo "  - Use wildcard SSL certificates from dotfiles setup"
echo ""
echo "Each tmux session with a PORT will be accessible at:"
echo "  - https://[session-name].$HOSTNAME/"
echo "  - https://[session-name].localhost/"
echo ""
echo "Make sure arthack-proxy is running to generate the site configurations."
echo ""
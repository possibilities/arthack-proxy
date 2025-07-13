#!/bin/bash

set -e

echo "=== Installing and configuring nginx for arthack-proxy ==="
echo ""

# Check if nginx is already installed
if command -v nginx &> /dev/null || [ -x /usr/sbin/nginx ]; then
    echo "✓ nginx is already installed"
else
    echo "Installing nginx..."
    sudo apt update
    sudo apt install -y nginx
    echo "✓ nginx installed successfully"
fi

# Ensure nginx is running
if ! systemctl is-active --quiet nginx; then
    echo "Starting nginx service..."
    sudo systemctl start nginx
    sudo systemctl enable nginx
    echo "✓ nginx service started and enabled"
else
    echo "✓ nginx service is running"
fi

echo ""
echo "nginx installation complete!"
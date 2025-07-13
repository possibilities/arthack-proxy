#!/bin/bash

set -e

echo "=== arthack-proxy Complete Setup ==="
echo ""
echo "This script will install and configure everything needed for arthack-proxy:"
echo "  - nginx web server"
echo "  - mkcert for SSL certificates"
echo "  - nginx configuration for dynamic site generation"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Step 1: Install nginx
echo ""
echo "Step 1/3: Installing nginx..."
bash "$SCRIPT_DIR/install-nginx.sh"

# Step 2: Install mkcert and generate certificates
echo ""
echo "Step 2/3: Setting up SSL certificates..."
bash "$SCRIPT_DIR/install-mkcert.sh"

# Step 3: Configure nginx for arthack-proxy
echo ""
echo "Step 3/3: Configuring nginx for arthack-proxy..."
bash "$SCRIPT_DIR/setup-nginx-arthack-proxy.sh"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "1. Build arthack-proxy:"
echo "   cd $(dirname "$SCRIPT_DIR")"
echo "   npm install"
echo "   npm run build"
echo ""
echo "2. Start arthack-proxy:"
echo "   npm start"
echo ""
echo "Your services will be available at:"
echo "  - https://[service].$(hostname)"
echo "  - https://[service].localhost"
echo ""
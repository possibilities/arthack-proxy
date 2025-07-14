#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_ROOT/certs"
HOSTNAME=$(hostname)

echo "🔐 Setting up mkcert for local HTTPS development"
echo "================================================"

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo "⚙️  mkcert is not installed. Installing it now..."
    echo ""
    
    # Install dependencies for Debian/Ubuntu
    echo "📦 Installing libnss3-tools..."
    sudo apt update
    sudo apt install -y libnss3-tools
    
    # Download and install mkcert
    echo ""
    echo "📥 Downloading mkcert..."
    curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
    
    echo "🔧 Installing mkcert..."
    chmod +x mkcert-v*-linux-amd64
    sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
    
    echo "✅ mkcert installed successfully!"
fi

echo "✅ mkcert is installed"

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Install the local CA if not already installed
echo ""
echo "📜 Installing local CA (this may require sudo password)..."
mkcert -install

# Generate certificates
echo ""
echo "🔧 Generating certificates for:"
echo "  - localhost"
echo "  - *.localhost"
echo "  - *.$HOSTNAME"
echo "  - 127.0.0.1"
echo "  - ::1"

cd "$CERTS_DIR"
mkcert -cert-file cert.pem -key-file key.pem \
    localhost "*.localhost" "*.$HOSTNAME" 127.0.0.1 ::1

echo ""
echo "✅ Certificates generated successfully!"
echo ""
echo "📁 Certificate files:"
echo "  - Certificate: $CERTS_DIR/cert.pem"
echo "  - Private key: $CERTS_DIR/key.pem"
echo ""
echo "🚀 Your proxy server can now use HTTPS!"
echo ""
echo "🌐 You can access your services via:"
echo "  - https://subdomain.localhost"
echo "  - https://subdomain.$HOSTNAME"
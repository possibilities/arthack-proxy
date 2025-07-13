#!/bin/bash

set -e

echo "=== Installing mkcert and generating SSL certificates ==="
echo ""

HOSTNAME=$(hostname)
echo "Detected hostname: $HOSTNAME"

# Detect the actual user if running with sudo
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
    ACTUAL_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    ACTUAL_USER="$USER"
    ACTUAL_HOME="$HOME"
fi

echo "Running as user: $ACTUAL_USER"

# Install libnss3-tools for browser certificate management
if ! command -v certutil &> /dev/null; then
    echo "Installing libnss3-tools for browser support..."
    sudo apt install -y libnss3-tools
fi

# Install mkcert if not already installed
if ! command -v mkcert &> /dev/null; then
    echo "Installing mkcert..."
    
    # Download and install mkcert
    MKCERT_VERSION="v1.4.4"
    wget -O /tmp/mkcert "https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/mkcert-${MKCERT_VERSION}-linux-amd64"
    chmod +x /tmp/mkcert
    sudo mv /tmp/mkcert /usr/local/bin/mkcert
    
    echo "✓ mkcert installed"
fi

# Install the local CA in the system trust store as the actual user
echo "Installing mkcert CA in system trust store..."
if [ -n "$SUDO_USER" ]; then
    sudo -u "$ACTUAL_USER" HOME="$ACTUAL_HOME" mkcert -install
else
    mkcert -install
fi

# Create directory for certificates
sudo mkdir -p /etc/nginx/ssl
sudo chmod 755 /etc/nginx/ssl

# Generate certificates as the actual user, then copy to nginx directory
echo "Generating certificates for $HOSTNAME and localhost..."
TEMP_DIR=$(mktemp -d)
if [ -n "$SUDO_USER" ]; then
    sudo chown "$ACTUAL_USER:$ACTUAL_USER" "$TEMP_DIR"
fi
cd "$TEMP_DIR"

# Generate hostname certificate with explicit subdomains for better Chrome compatibility
echo "Generating certificate for $HOSTNAME domains..."
if [ -n "$SUDO_USER" ]; then
    sudo -u "$ACTUAL_USER" HOME="$ACTUAL_HOME" mkcert -cert-file "$HOSTNAME.crt" -key-file "$HOSTNAME.key" \
        "$HOSTNAME" "*.$HOSTNAME" \
        "www.$HOSTNAME" "app.$HOSTNAME" "api.$HOSTNAME" "tmux.$HOSTNAME" \
        "dev.$HOSTNAME" "test.$HOSTNAME" "staging.$HOSTNAME"
else
    mkcert -cert-file "$HOSTNAME.crt" -key-file "$HOSTNAME.key" \
        "$HOSTNAME" "*.$HOSTNAME" \
        "www.$HOSTNAME" "app.$HOSTNAME" "api.$HOSTNAME" "tmux.$HOSTNAME" \
        "dev.$HOSTNAME" "test.$HOSTNAME" "staging.$HOSTNAME"
fi

# Generate separate localhost certificate
echo "Generating certificate for localhost domains..."
if [ -n "$SUDO_USER" ]; then
    sudo -u "$ACTUAL_USER" HOME="$ACTUAL_HOME" mkcert -cert-file "localhost.crt" -key-file "localhost.key" \
        "localhost" "*.localhost" "127.0.0.1" "::1"
else
    mkcert -cert-file "localhost.crt" -key-file "localhost.key" \
        "localhost" "*.localhost" "127.0.0.1" "::1"
fi

# Copy certificates to nginx directory with proper permissions
sudo cp "$HOSTNAME.crt" "/etc/nginx/ssl/$HOSTNAME.crt"
sudo cp "$HOSTNAME.key" "/etc/nginx/ssl/$HOSTNAME.key"
sudo cp "localhost.crt" "/etc/nginx/ssl/localhost.crt"
sudo cp "localhost.key" "/etc/nginx/ssl/localhost.key"
sudo chmod 644 "/etc/nginx/ssl/$HOSTNAME.crt"
sudo chmod 600 "/etc/nginx/ssl/$HOSTNAME.key"
sudo chmod 644 "/etc/nginx/ssl/localhost.crt"
sudo chmod 600 "/etc/nginx/ssl/localhost.key"

# Clean up temp directory
cd /
rm -rf "$TEMP_DIR"

echo "✓ Certificates generated successfully"

# Get the actual CA root for the user
if [ -n "$SUDO_USER" ]; then
    CA_ROOT=$(sudo -u "$ACTUAL_USER" HOME="$ACTUAL_HOME" mkcert -CAROOT)
else
    CA_ROOT=$(mkcert -CAROOT)
fi

echo ""
echo "=== mkcert SSL Setup Complete ==="
echo ""
echo "HTTPS is now available with browser-trusted certificates for:"
echo ""
echo "Hostname domains:"
echo "  - https://$HOSTNAME/"
echo "  - https://*.$HOSTNAME/ (wildcard)"
echo "  - Explicit subdomains: www, app, api, tmux, dev, test, staging"
echo ""
echo "Localhost domains:"
echo "  - https://localhost/"
echo "  - https://127.0.0.1/"
echo "  - https://::1/"
echo "  - https://*.localhost/ (wildcard - e.g., tmux.localhost)"
echo ""
echo "Certificate details:"
echo "  - Hostname cert: /etc/nginx/ssl/$HOSTNAME.crt and .key"
echo "  - Localhost cert: /etc/nginx/ssl/localhost.crt and .key"
echo "  - CA location: $CA_ROOT"
echo ""
echo "✓ All browsers including Chrome will trust these certificates automatically"
echo ""
echo "Note: For Chrome flatpak, you may need to manually import the CA:"
echo "  1. Open Chrome and go to chrome://settings/certificates"
echo "  2. Click 'Authorities' tab → 'Import'"
echo "  3. Select: $CA_ROOT/rootCA.pem"
echo "  4. Check 'Trust this certificate for identifying websites'"
echo ""
#!/bin/bash

set -e

echo "🔧 Fixing dnsmasq configuration for arthack-proxy"
echo "================================================"

# 1. First, clean up any bad configs
echo "🧹 Cleaning up old configurations..."
sudo rm -f /etc/dnsmasq.d/00-arthack-*
sudo rm -f /etc/systemd/resolved.conf.d/arthack-proxy.conf

# 2. Create a proper dnsmasq configuration that doesn't conflict with libvirt
echo "📝 Creating system dnsmasq configuration..."
sudo tee /etc/dnsmasq.conf > /dev/null << 'EOF'
# Basic dnsmasq configuration
# This runs alongside libvirt's dnsmasq without conflicts

# Include all files from dnsmasq.d directory
conf-dir=/etc/dnsmasq.d

# Don't read /etc/hosts - we'll define our own entries
no-hosts

# Listen on localhost for system DNS queries
listen-address=127.0.0.1
bind-interfaces

# Don't listen on libvirt's bridge
except-interface=virbr0

# Upstream DNS servers (use your current system DNS)
# These will be used for domains we don't explicitly handle
server=8.8.8.8
server=8.8.4.4
EOF

# 3. Make sure our arthack-proxy config is correct
echo "📝 Creating arthack-proxy DNS configuration..."
HOSTNAME=$(hostname)
sudo tee /etc/dnsmasq.d/arthack-proxy.conf > /dev/null << EOF
# Wildcard DNS for arthack-proxy
# Routes *.localhost and *.$HOSTNAME to 127.0.0.1

# Wildcard DNS entries
address=/.localhost/127.0.0.1
address=/.$HOSTNAME/127.0.0.1
EOF

# 4. Configure system to use our dnsmasq
echo "🔧 Configuring system DNS..."

# Check if using systemd-resolved
if systemctl is-active --quiet systemd-resolved; then
    echo "📝 Disabling systemd-resolved (conflicts with dnsmasq)..."
    sudo systemctl stop systemd-resolved
    sudo systemctl disable systemd-resolved
    
    # Remove the symlink and create a real resolv.conf
    sudo rm -f /etc/resolv.conf
    echo "nameserver 127.0.0.1" | sudo tee /etc/resolv.conf > /dev/null
else
    # Backup current resolv.conf
    sudo cp /etc/resolv.conf /etc/resolv.conf.backup
    
    # Update resolv.conf to use local dnsmasq
    echo "nameserver 127.0.0.1" | sudo tee /etc/resolv.conf > /dev/null
fi

# 5. Start dnsmasq
echo "🚀 Starting dnsmasq service..."
sudo systemctl restart dnsmasq

if systemctl is-active --quiet dnsmasq; then
    echo "✅ dnsmasq is running successfully!"
    
    # Test DNS resolution
    echo ""
    echo "🧪 Testing DNS resolution..."
    echo -n "  test.localhost: "
    dig +short test.localhost @127.0.0.1 || echo "Failed"
    echo -n "  app.$HOSTNAME: "
    dig +short app.$HOSTNAME @127.0.0.1 || echo "Failed"
    echo -n "  google.com: "
    dig +short google.com @127.0.0.1 | head -1 || echo "Failed"
else
    echo "❌ Failed to start dnsmasq"
    echo "   Check: sudo journalctl -u dnsmasq -n 50"
fi

echo ""
echo "✅ Done! Your system should now resolve:"
echo "  - *.localhost → 127.0.0.1"
echo "  - *.$HOSTNAME → 127.0.0.1"
echo ""
echo "🔄 To revert these changes:"
echo "  1. sudo systemctl stop dnsmasq"
echo "  2. sudo systemctl enable systemd-resolved"
echo "  3. sudo systemctl start systemd-resolved"
echo "  4. sudo cp /etc/resolv.conf.backup /etc/resolv.conf"
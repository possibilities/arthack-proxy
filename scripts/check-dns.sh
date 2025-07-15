#!/bin/bash

HOSTNAME=$(hostname)

echo "🔍 Checking DNS resolution for arthack-proxy domains..."
echo ""

# Function to check DNS resolution
check_dns() {
    local domain=$1
    local result=$(dig +short "$domain" @127.0.0.1 2>/dev/null)
    
    if [ "$result" = "127.0.0.1" ]; then
        echo "✅ $domain → 127.0.0.1"
    else
        echo "❌ $domain → $result (expected 127.0.0.1)"
    fi
}

# Check DNS service status
if systemctl is-active --quiet dnsmasq; then
    echo "✅ dnsmasq is running"
    # Check which instance/config
    DNSMASQ_PID=$(systemctl show -p MainPID dnsmasq | cut -d= -f2)
    if [ "$DNSMASQ_PID" != "0" ]; then
        LISTEN_ADDR=$(sudo ss -tlnp | grep "pid=$DNSMASQ_PID" | awk '{print $4}')
        echo "   Listening on: $LISTEN_ADDR"
    fi
elif systemctl is-active --quiet systemd-resolved; then
    echo "✅ systemd-resolved is running (no wildcard support)"
else
    echo "❌ No DNS service is running"
    echo "   Install dnsmasq: sudo apt install dnsmasq"
fi

echo ""

# Check if our config exists
if [ -f "/etc/dnsmasq.d/arthack-proxy.conf" ]; then
    echo "✅ arthack-proxy.conf exists"
    echo ""
    echo "📄 Config contents:"
    cat /etc/dnsmasq.d/arthack-proxy.conf | sed 's/^/   /'
else
    echo "❌ /etc/dnsmasq.d/arthack-proxy.conf not found"
    echo "   Run: arthack setup:certs"
fi

echo ""
echo "🌐 Testing DNS resolution:"

# Test various subdomains
check_dns "test.localhost"
check_dns "app.localhost"
check_dns "api.localhost"
check_dns "test.$HOSTNAME"
check_dns "app.$HOSTNAME"

echo ""
echo "💡 Tip: If resolution fails, check:"
echo "   1. Is dnsmasq running? (sudo systemctl status dnsmasq)"
echo "   2. Is 127.0.0.1 listed in /etc/resolv.conf as nameserver?"
echo "   3. Try: dig test.localhost @127.0.0.1"
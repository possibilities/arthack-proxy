#!/bin/bash

set -e

HOSTNAME=$(hostname)

echo "🌐 Setting up DNS for arthack-proxy"
echo "=================================="

# Function to add hosts entry if it doesn't exist
add_hosts_entry() {
    local ip="$1"
    local hosts="$2"
    
    if ! grep -q "$hosts" /etc/hosts; then
        echo "$ip $hosts" | sudo tee -a /etc/hosts > /dev/null
        echo "✅ Added: $ip $hosts"
    else
        echo "⏭️  Already exists: $hosts"
    fi
}

echo ""
echo "📝 Adding common subdomains to /etc/hosts..."

# Add localhost subdomains
SUBDOMAINS="app api admin dashboard test dev staging"
for subdomain in $SUBDOMAINS; do
    add_hosts_entry "127.0.0.1" "$subdomain.localhost"
    add_hosts_entry "127.0.0.1" "$subdomain.$HOSTNAME"
done

# Add the base domains too
add_hosts_entry "127.0.0.1" "localhost"
add_hosts_entry "127.0.0.1" "$HOSTNAME"

echo ""
echo "✅ DNS entries added to /etc/hosts"
echo ""
echo "🌐 You can now access services like:"
echo "  - http://app.localhost"
echo "  - https://api.localhost"
echo "  - http://test.$HOSTNAME"
echo "  - https://dev.$HOSTNAME"
echo ""
echo "💡 To add more subdomains, edit /etc/hosts or run:"
echo "   echo '127.0.0.1 myapp.localhost myapp.$HOSTNAME' | sudo tee -a /etc/hosts"
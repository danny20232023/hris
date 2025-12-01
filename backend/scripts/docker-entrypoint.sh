#!/bin/sh
# Docker entrypoint script that checks network share mount before starting the app

set -e

MOUNT_POINT="${NETWORK_SHARE_MOUNT_POINT:-/mnt/hris}"

echo "🚀 Starting HRIS Backend Container..."
echo ""

# Check if network share mount point exists
if [ -d "$MOUNT_POINT" ]; then
    echo "✅ Network share mount point exists: $MOUNT_POINT"
    
    # Check if it's accessible
    if [ -r "$MOUNT_POINT" ] && [ -w "$MOUNT_POINT" ]; then
        echo "✅ Network share is accessible (read/write)"
        
        # Try to list contents
        if ls "$MOUNT_POINT" > /dev/null 2>&1; then
            ITEM_COUNT=$(ls -1 "$MOUNT_POINT" 2>/dev/null | wc -l)
            echo "✅ Mount is active (found $ITEM_COUNT items)"
        else
            echo "⚠️  Mount point exists but cannot list contents"
        fi
    else
        echo "⚠️  Network share mount point exists but may not be accessible"
        echo "   Check permissions and ensure the share is properly mounted on the host"
    fi
else
    echo "⚠️  Network share mount point does not exist: $MOUNT_POINT"
    echo "   The system will use local storage"
    echo ""
    echo "   To use network storage:"
    echo "   1. On Docker HOST, run: sudo ./scripts/mount-network-share.sh"
    echo "   2. Ensure docker-compose.yml has: - /mnt/hris:/mnt/hris:rw"
    echo "   3. Restart the container: docker-compose restart backend"
fi

echo ""

# Run the application
exec "$@"


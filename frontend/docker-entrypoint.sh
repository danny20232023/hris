#!/bin/sh
set -e

# Copy built files from temp location to the volume mount point
# The volume mount will override /usr/share/nginx/html, so we copy fresh files on each start
echo "📦 Copying frontend files to shared volume..."
if [ -d "/tmp/frontend-dist" ]; then
    # Ensure destination directory exists
    mkdir -p /usr/share/nginx/html
    # Copy all files from temp location to the volume mount point
    cp -r /tmp/frontend-dist/* /usr/share/nginx/html/ || true
    echo "✅ Frontend files copied successfully"
else
    echo "⚠️  Warning: /tmp/frontend-dist not found, using existing files in /usr/share/nginx/html"
fi

# Don't start nginx here - the nginx container will serve the files
# Just keep the container running by sleeping
echo "✅ Files ready. Frontend container ready. Nginx container will serve files."
exec tail -f /dev/null


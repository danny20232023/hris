#!/bin/sh
set -e

# Copy built files to the volume mount point (which will be shared with nginx)
echo "📦 Copying frontend files to shared volume..."
if [ -d "/app/dist" ]; then
    # Ensure destination directory exists
    mkdir -p /usr/share/nginx/html
    # Copy all files from dist to the volume mount point
    cp -r /app/dist/* /usr/share/nginx/html/ || true
    echo "✅ Frontend files copied successfully"
else
    echo "⚠️  Warning: /app/dist not found, using existing files in /usr/share/nginx/html"
fi

# Don't start nginx here - the nginx container will serve the files
# Just keep the container running by sleeping
echo "✅ Files copied. Frontend container ready. Nginx container will serve files."
exec tail -f /dev/null


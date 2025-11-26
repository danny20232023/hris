#!/bin/sh
set -e

TEMPLATE_PATH="/etc/nginx/templates/nginx.conf.template"
OUTPUT_PATH="/etc/nginx/conf.d/default.conf"

echo "🔧 Generating nginx configuration..."
if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "❌ Template not found at $TEMPLATE_PATH"
  exit 1
fi

envsubst '${DOMAIN_NAME} ${BACKEND_PORT} ${FRONTEND_PORT}' < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
echo "✅ Nginx configuration generated at $OUTPUT_PATH"

echo "🚀 Starting nginx..."
exec nginx -g 'daemon off;'


#!/bin/bash

echo "🔍 HRIS Backend Health Diagnostic"
echo "=================================="
echo ""

# Check if backend container is running
echo "1. Checking backend container status..."
if docker ps | grep -q hris-backend; then
    echo "   ✅ Backend container is running"
    CONTAINER_ID=$(docker ps | grep hris-backend | awk '{print $1}')
else
    echo "   ❌ Backend container is NOT running"
    echo "   📋 Checking stopped containers..."
    docker ps -a | grep hris-backend
    exit 1
fi

echo ""
echo "2. Checking backend logs (last 50 lines)..."
docker logs --tail 50 hris-backend

echo ""
echo "3. Testing backend health endpoint from inside container..."
docker exec hris-backend wget -q -O- http://localhost:5000/health || echo "   ❌ Health check failed"

echo ""
echo "4. Testing backend from nginx container..."
if docker ps | grep -q hris-nginx; then
    docker exec hris-nginx wget -q -O- http://backend:5000/health || echo "   ❌ Cannot reach backend from nginx"
else
    echo "   ⚠️  Nginx container not running"
fi

echo ""
echo "5. Checking network connectivity..."
docker network inspect hris-network | grep -A 5 "Containers" || echo "   ⚠️  Network check failed"

echo ""
echo "6. Checking environment variables..."
docker exec hris-backend env | grep -E "PORT|DB_|HR201_" || echo "   ⚠️  Could not read env vars"

echo ""
echo "✅ Diagnostic complete"


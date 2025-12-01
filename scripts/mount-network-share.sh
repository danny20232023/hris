#!/bin/bash
# Wrapper script to mount network share using database credentials
# This script calls the Node.js script that reads from network_FSC and media_path tables

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== HRIS Network Share Auto-Mount (Database-Driven) ===${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    echo "   Example: sudo ./scripts/mount-network-share.sh"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Check if .env file exists (for database connection)
if [ ! -f "$PROJECT_ROOT/.env.docker" ] && [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}Warning: No .env file found${NC}"
    echo "   The script will use default database connection settings"
fi

# Load environment variables
if [ -f "$PROJECT_ROOT/.env.docker" ]; then
    export $(cat "$PROJECT_ROOT/.env.docker" | grep -v '^#' | xargs)
elif [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Ensure ENCRYPTION_KEY is set (required for password decryption)
if [ -z "$ENCRYPTION_KEY" ]; then
    echo -e "${YELLOW}Warning: ENCRYPTION_KEY not set in environment${NC}"
    echo "   Password decryption may fail if password is encrypted"
    echo "   Set it in .env.docker or .env file"
fi

# Change to backend directory
cd "$BACKEND_DIR"

# Run the Node.js mount script
echo -e "${GREEN}Running mount script...${NC}"
echo ""

node scripts/mountNetworkShareFromDB.js

exit $?


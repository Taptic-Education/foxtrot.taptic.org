#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║       FOXTROT INSTALLER (No Caddy)       ║"
echo "║    Cost Center Management System         ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo bash install-no-caddy.sh)${NC}"
  exit 1
fi

read -p "Domain or IP (e.g. foxtrot.yourdomain.com or 1.2.3.4): " DOMAIN
read -p "Use SSL? (y/n): " USE_SSL

DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)

# Install Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Install Nginx
apt-get update
apt-get install -y nginx

# Copy app
APP_DIR="/opt/foxtrot"
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "${APP_DIR}_backup_$(date +%Y%m%d%H%M%S)"
fi
cp -r . "$APP_DIR"
cd "$APP_DIR"

PROTOCOL="http"
if [ "$USE_SSL" = "y" ]; then
  PROTOCOL="https"
fi

# Write .env
cat > .env << EOF
DB_USER=foxtrot
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
APP_URL=${PROTOCOL}://${DOMAIN}
RESEND_API_KEY=
RESEND_FROM_EMAIL=foxtrot@${DOMAIN}
EOF

# Nginx config
cat > /etc/nginx/sites-available/foxtrot << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -sf /etc/nginx/sites-available/foxtrot /etc/nginx/sites-enabled/foxtrot
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

if [ "$USE_SSL" = "y" ]; then
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@${DOMAIN}" || \
    echo "SSL setup failed. You can run: certbot --nginx -d ${DOMAIN}"
fi

echo -e "${GREEN}Building and starting Foxtrot...${NC}"
docker compose up -d --build

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║        FOXTROT IS RUNNING!               ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo "🌍 App URL: ${PROTOCOL}://${DOMAIN}"
echo "📝 First run: Visit ${PROTOCOL}://${DOMAIN}/setup to configure your organisation"
echo ""
echo -e "${YELLOW}SAVE THESE CREDENTIALS:${NC}"
echo "DB_PASSWORD: ${DB_PASSWORD}"
echo "JWT_SECRET: ${JWT_SECRET}"

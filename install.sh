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
echo "║          FOXTROT INSTALLER               ║"
echo "║    Cost Center Management System         ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo bash install.sh)${NC}"
  exit 1
fi

# Collect config
echo -e "${YELLOW}Configuration${NC}"
read -p "Domain (e.g. foxtrot.yourdomain.com): " DOMAIN
read -p "Cloudflare API Token (leave blank to use Let's Encrypt HTTP challenge): " CF_TOKEN
read -p "Admin Email (for TLS certificates): " ADMIN_EMAIL

# Generate secrets
DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)

echo -e "${GREEN}Installing dependencies...${NC}"

# Docker
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  apt-get install -y docker-compose-plugin
fi

# Caddy installation
if ! command -v caddy &> /dev/null; then
  echo -e "${GREEN}Installing Caddy...${NC}"
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

# If Cloudflare token provided, ensure Caddy has the Cloudflare DNS module
if [ -n "$CF_TOKEN" ]; then
  if ! caddy list-modules 2>/dev/null | grep -q 'dns.providers.cloudflare'; then
    echo -e "${GREEN}Building Caddy with Cloudflare DNS plugin...${NC}"
    if ! command -v go &> /dev/null; then
      go_version="go1.22.1"
      wget -q "https://go.dev/dl/${go_version}.linux-amd64.tar.gz" -O /opt/go.tar.gz
      rm -rf /usr/local/go
      tar -C /usr/local -xzf /opt/go.tar.gz
      rm -f /opt/go.tar.gz
    fi
    export PATH=$PATH:/usr/local/go/bin:${HOME}/go/bin
    if ! command -v xcaddy &> /dev/null; then
      go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
    fi
    if ! command -v xcaddy &> /dev/null; then
      echo -e "${RED}Failed to install xcaddy. Cannot build Caddy with Cloudflare plugin.${NC}"
      exit 1
    fi
    systemctl stop caddy 2>/dev/null || true
    xcaddy build --with github.com/caddy-dns/cloudflare --output /usr/bin/caddy
    echo -e "${GREEN}Caddy rebuilt with Cloudflare DNS support.${NC}"
  fi
else
  echo -e "${YELLOW}No Cloudflare token provided. Caddy will use Let's Encrypt HTTP challenge.${NC}"
  echo -e "${YELLOW}Make sure port 80 is open and your domain's A record points to this server.${NC}"
fi

# Clone / copy app
APP_DIR="/opt/foxtrot"
if [ -d "$APP_DIR" ]; then
  echo -e "${YELLOW}$APP_DIR already exists. Backing up...${NC}"
  mv "$APP_DIR" "${APP_DIR}_backup_$(date +%Y%m%d%H%M%S)"
fi

cp -r . "$APP_DIR"
cd "$APP_DIR"

# Write .env
cat > .env << EOF
DB_USER=foxtrot
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
APP_URL=https://${DOMAIN}
EOF

echo -e "${GREEN}Generated .env (keep this safe!)${NC}"
echo "DB_PASSWORD: ${DB_PASSWORD}"
echo "JWT_SECRET: ${JWT_SECRET}"

# Write Caddyfile
if [ -n "$CF_TOKEN" ]; then
  cat > /etc/caddy/Caddyfile << EOF
{
    email ${ADMIN_EMAIL}
}

${DOMAIN} {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    handle /api/* {
        reverse_proxy localhost:3001
    }

    handle /uploads/* {
        reverse_proxy localhost:3001
    }

    handle {
        reverse_proxy localhost:3000
    }

    encode gzip
}
EOF

  # Set CLOUDFLARE_API_TOKEN for Caddy systemd
  mkdir -p /etc/systemd/system/caddy.service.d
  cat > /etc/systemd/system/caddy.service.d/cloudflare.conf << EOF
[Service]
Environment="CLOUDFLARE_API_TOKEN=${CF_TOKEN}"
EOF
else
  cat > /etc/caddy/Caddyfile << EOF
{
    email ${ADMIN_EMAIL}
}

${DOMAIN} {
    handle /api/* {
        reverse_proxy localhost:3001
    }

    handle /uploads/* {
        reverse_proxy localhost:3001
    }

    handle {
        reverse_proxy localhost:3000
    }

    encode gzip
}
EOF

  # Remove any leftover Cloudflare systemd override
  rm -f /etc/systemd/system/caddy.service.d/cloudflare.conf
fi

systemctl daemon-reload

# Build and start
echo -e "${GREEN}Building and starting Foxtrot...${NC}"
docker compose up -d --build

# Start Caddy
systemctl enable caddy
systemctl restart caddy

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║        FOXTROT IS RUNNING!               ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo "🌍 App URL: https://${DOMAIN}"
echo "📝 First run: Visit https://${DOMAIN}/setup to configure your organisation"
echo ""
echo -e "${YELLOW}SAVE THESE CREDENTIALS:${NC}"
echo "DB_PASSWORD: ${DB_PASSWORD}"
echo "JWT_SECRET: ${JWT_SECRET}"

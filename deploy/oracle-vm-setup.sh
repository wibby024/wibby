#!/usr/bin/env bash
# ==============================================================================
# WIBBY — ORACLE ALWAYS FREE VM (ARM AMPERE A1) PROVISIONING SCRIPT
# OS Target: Ubuntu 22.04 LTS / 24.04 LTS (aarch64 / amd64)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🚀 STARTING WIBBY PRODUCTION ENVIRONMENT PROVISIONING"
echo "=========================================================="

# Ensure running as root or with sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root or with sudo: sudo ./oracle-vm-setup.sh"
  exit 1
fi

# 1. Update system packages
echo "📦 Updating APT package index..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget gnupg lsb-release ufw build-essential git coturn nginx certbot python3-certbot-nginx

# 2. Configure Firewall (UFW)
echo "🛡️ Configuring Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 3478/tcp comment 'STUN/TURN TCP'
ufw allow 3478/udp comment 'STUN/TURN UDP'
ufw allow 5349/tcp comment 'TURNS TLS TCP'
ufw allow 5349/udp comment 'TURNS TLS UDP'
ufw allow 49152:65535/udp comment 'WebRTC Media Relay Ports'
echo "y" | ufw enable || true

# 3. Install Node.js 20 LTS
echo "🟢 Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install PM2 globally
npm install -g pm2

# 4. Install MongoDB Community Edition (Private Bound to 127.0.0.1)
echo "🍃 Installing MongoDB Community Edition..."
if ! command -v mongod &> /dev/null; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
  
  ARCH=$(dpkg --print-architecture)
  UBUNTU_CODENAME=$(lsb_release -cs)
  # Fallback for Ubuntu 24.04 if jammy repo needed
  if [ "$UBUNTU_CODENAME" = "noble" ]; then
    UBUNTU_CODENAME="jammy"
  fi

  echo "deb [ arch=${ARCH} signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_CODENAME}/mongodb-org/7.0 multiverse" | \
    tee /etc/apt/sources.list.d/mongodb-org-7.0.list

  apt-get update -y
  apt-get install -y mongodb-org || true
fi

# Ensure MongoDB is strictly bound to 127.0.0.1
if [ -f /etc/mongod.conf ]; then
  sed -i 's/bindIp: .*/bindIp: 127.0.0.1/' /etc/mongod.conf
fi

systemctl daemon-reload
systemctl enable mongod
systemctl restart mongod
echo "🍃 MongoDB active and bound privately to 127.0.0.1"

# 5. Create application directories
echo "📁 Setting up Wibby directory structure..."
mkdir -p /var/www/wibby
mkdir -p /var/www/wibby/server/uploads
mkdir -p /var/log/wibby
mkdir -p /var/www/certbot

chown -R www-data:www-data /var/www/wibby
chmod -R 755 /var/www/wibby

# 6. Enable Coturn
echo "🔄 Configuring Coturn TURN/STUN..."
if [ -f /etc/default/coturn ]; then
  sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
  sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn
fi
systemctl enable coturn

echo "=========================================================="
echo "✅ WIBBY SERVER ENVIRONMENT PROVISIONED SUCCESSFULLY!"
echo "=========================================================="
echo "Next Steps:"
echo "1. Clone the repository into /var/www/wibby"
echo "2. Create /var/www/wibby/server/.env using server/.env.production.example"
echo "3. Copy deploy/nginx/wibby.conf to /etc/nginx/sites-available/wibby"
echo "4. Enable site: ln -s /etc/nginx/sites-available/wibby /etc/nginx/sites-enabled/"
echo "5. Issue SSL: certbot --nginx -d wibby.com -d www.wibby.com -d api.wibby.com"
echo "6. Run deploy/deploy-backend.sh"

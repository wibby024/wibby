#!/usr/bin/env bash
# ==============================================================================
# WIBBY — ZERO-DOWNTIME BACKEND DEPLOYMENT SCRIPT
# ==============================================================================

set -euo pipefail

APP_DIR="/var/www/wibby/server"
cd "$APP_DIR"

echo "🚀 Deploying Wibby Backend on $(date)..."

# 1. Check for .env file
if [ ! -f .env ]; then
  echo "❌ Error: /var/www/wibby/server/.env file is missing!"
  echo "Please copy server/.env.production.example to .env and populate your secrets."
  exit 1
fi

# 2. Install production dependencies
echo "📦 Installing server dependencies..."
npm ci --production=false

# 3. Compile TypeScript
echo "🔨 Building TypeScript server..."
npm run build

# 4. Restart or Start PM2
echo "🔄 Reloading PM2 process..."
if pm2 list | grep -q "wibby-api"; then
  pm2 reload /var/www/wibby/deploy/pm2/ecosystem.config.cjs --update-env
else
  pm2 start /var/www/wibby/deploy/pm2/ecosystem.config.cjs --env production
  pm2 save
fi

# 5. Verify Health
echo "🩺 Verifying backend health endpoint..."
sleep 2
HEALTH_RES=$(curl -s http://127.0.0.1:3000/health || echo "FAIL")

if echo "$HEALTH_RES" | grep -q '"status":"ok"'; then
  echo "✅ Wibby Backend is HEALTHY and RUNNING!"
  echo "$HEALTH_RES"
else
  echo "⚠️ Warning: Health check did not return ok: $HEALTH_RES"
  echo "Check logs: pm2 logs wibby-api"
  exit 1
fi

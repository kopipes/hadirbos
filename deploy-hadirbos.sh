#!/bin/bash
# HadirBos Safe Deploy Script
# SOT: https://github.com/kopipes/hadirbos.git
# DB SOT: VPS (SQLite preserved across deploys)
# Usage:
#   sudo bash /var/www/deploy-hadirbos.sh          # deploy latest
#   sudo bash /var/www/deploy-hadirbos.sh rollback  # rollback to last backup

set -e

APP_DIR=/var/www/hadirbos
BACKUP_DIR=/var/www/hadirbos-backups
DB_FILE=$APP_DIR/prisma/dev.db
REPO=https://github.com/kopipes/hadirbos.git
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PORT=3002
PM2_NAME=hadirbos

mkdir -p $BACKUP_DIR

# ── ROLLBACK ───────────────────────────────────────────────────────────────────
if [ "$1" == "rollback" ]; then
  LATEST=$(ls -t $BACKUP_DIR | head -1)
  if [ -z "$LATEST" ]; then
    echo "No backups found in $BACKUP_DIR"
    exit 1
  fi
  echo "Rolling back to: $LATEST"

  # Preserve current DB before overwriting
  if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_DIR/rollback-db-$TIMESTAMP.db"
    echo "Current DB saved to $BACKUP_DIR/rollback-db-$TIMESTAMP.db"
  fi

  sudo rsync -a --delete \
    --exclude='prisma/dev.db' \
    --exclude='.env' \
    "$BACKUP_DIR/$LATEST/" "$APP_DIR/"

  sudo chown -R www-data:www-data $APP_DIR
  sudo -u www-data pm2 restart $PM2_NAME || sudo -u www-data pm2 start $APP_DIR/ecosystem.config.js
  echo "Rollback complete to $LATEST"
  exit 0
fi

# ── FORWARD DEPLOY ─────────────────────────────────────────────────────────────
echo "=== HadirBos Deploy $TIMESTAMP ==="

# 1. Backup current version (exclude DB — VPS is SOT for DB)
if [ -d "$APP_DIR" ]; then
  echo "1. Backing up current version (excluding DB)..."
  mkdir -p "$BACKUP_DIR/$TIMESTAMP"
  sudo rsync -a \
    --exclude='prisma/dev.db' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.env' \
    "$APP_DIR/" "$BACKUP_DIR/$TIMESTAMP/"
  echo "   Backup saved: $BACKUP_DIR/$TIMESTAMP"
else
  echo "1. No existing install — skipping backup."
fi

# 2. Backup DB separately with timestamp
if [ -f "$DB_FILE" ]; then
  echo "2. Backing up database..."
  cp "$DB_FILE" "$BACKUP_DIR/db-$TIMESTAMP.db"
  echo "   DB backup: $BACKUP_DIR/db-$TIMESTAMP.db"
fi

# 3. Clone or pull from GitHub
echo "3. Pulling latest from GitHub..."
if [ -d "$APP_DIR/.git" ]; then
  cd $APP_DIR
  sudo git fetch origin main
  sudo git reset --hard origin/main
else
  # Directory exists but no git repo — clone to temp then move contents
  TEMP_DIR=$(mktemp -d)
  sudo git clone $REPO $TEMP_DIR
  sudo rsync -a --exclude='.env' --exclude='prisma/dev.db' $TEMP_DIR/ $APP_DIR/
  sudo rm -rf $TEMP_DIR
  cd $APP_DIR
fi

# 4. Restore .env (never overwrite existing production .env)
if [ ! -f "$APP_DIR/.env" ]; then
  echo "   WARNING: No .env found. Creating from .env.example..."
  if [ -f "$APP_DIR/.env.example" ]; then
    sudo cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    echo "   Edit $APP_DIR/.env before running again!"
  fi
fi

# 5. Install ALL dependencies (including devDeps needed for build)
echo "4. Installing dependencies..."
cd $APP_DIR
sudo npm ci 2>&1 | tail -5

# 6. Generate Prisma client
echo "5. Generating Prisma client..."
sudo npx prisma generate

# 7. Push DB schema (safe — only adds new tables/columns, no data loss)
echo "6. Pushing DB schema (safe migration)..."
sudo npx prisma db push --skip-generate

# 8. Seed only if DB is new (no users table data)
USER_COUNT=$(sudo npx prisma db execute --stdin <<< "SELECT COUNT(*) as c FROM User;" 2>/dev/null | grep -oE '[0-9]+' | tail -1 || echo "0")
if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "7. Seeding database (first deploy)..."
  sudo npm run db:seed
else
  echo "7. Skipping seed ($USER_COUNT users already exist)."
fi

# 9. Build Next.js
echo "8. Building Next.js app..."
sudo npm run build

# 11. Create/update systemd service file
echo "10. Writing systemd service..."
sudo tee /etc/systemd/system/hadirbos.service > /dev/null << SVCEOF
[Unit]
Description=HadirBos Attendance App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=PORT=$PORT
Environment=NODE_ENV=production
ExecStart=/usr/bin/node node_modules/.bin/next start -p $PORT
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hadirbos

[Install]
WantedBy=multi-user.target
SVCEOF

# 12. Reload systemd and restart service
echo "11. Starting app via systemd..."
sudo systemctl daemon-reload
sudo systemctl enable hadirbos
if sudo systemctl is-active --quiet hadirbos; then
  sudo systemctl restart hadirbos
else
  sudo systemctl start hadirbos
fi
sleep 3
sudo systemctl is-active hadirbos && echo "Service is running" || echo "WARNING: Service failed to start"

# 13. Keep last 5 backups
echo "12. Cleaning old backups (keeping last 5)..."
ls -t $BACKUP_DIR | grep -E '^[0-9]{8}_' | tail -n +6 | xargs -I{} sudo rm -rf "$BACKUP_DIR/{}"

echo ""
echo "=== HadirBos Deploy Complete! ==="
echo "   App:      https://hadirbos.provaliantgroup.com"
echo "   Port:     $PORT"
echo "   PM2:      sudo -u www-data pm2 status"
echo "   Logs:     sudo -u www-data pm2 logs $PM2_NAME"
echo "   Rollback: sudo bash /var/www/deploy-hadirbos.sh rollback"

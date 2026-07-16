# Host a private ROCKBOTTOM shard

This guide runs one 64-player private shard on a 2-vCPU, 8GB Ubuntu VPS. Docker Compose starts Caddy, the game server, browser clients, MCP bridge, Postgres, and Redis with conservative memory limits.

## 1. Prepare the host

Point an `A` record such as `play.example.com` to the VPS. Open TCP ports 22, 80, and 443. Voice chat also needs UDP 3478 only after adding an external TURN service; the shipped MVP uses browser mesh and does not expose a TURN container.

```bash
sudo apt update && sudo apt install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

## 2. Configure the shard

```bash
git clone https://github.com/MathewFigueroa/rockbottom-rpg.git
cd rockbottom-rpg
cp .env.example .env
openssl rand -base64 36
```

Edit `.env`:

```dotenv
DOMAIN=play.example.com
POSTGRES_DB=rockbottom
POSTGRES_USER=rockbottom
POSTGRES_PASSWORD=use-a-long-random-password
DATABASE_URL=postgresql://rockbottom:use-a-long-random-password@postgres:5432/rockbottom
REDIS_URL=redis://redis:6379
ADMIN_USER=warden
ADMIN_PASSWORD=use-another-long-random-password
ADMIN_SESSION_SECRET=paste-the-openssl-result
PREMIUM_ALL_FREE=true
```

`PREMIUM_ALL_FREE=true` keeps private shards free of hosted-service gates. No game advantage is sold.

## 3. Start and verify

```bash
docker compose up -d --build
docker compose ps
curl -fsS https://play.example.com/health
```

Caddy obtains and renews TLS automatically after DNS resolves. The game is at `https://play.example.com`, admin is at `/admin/`, spectator links use `/watch/CHARACTER_ID`, and MCP SSE uses `/mcp/sse?token=CHARACTER_TOKEN`.

## 4. Admin and privacy

Sign in with `ADMIN_USER` and `ADMIN_PASSWORD`. Change the password immediately if it was ever pasted into a shell history or chat. The admin session cookie is HTTP-only, Secure in production, same-site strict, and expires after eight hours.

Voice reports store a 30-second evidence clip. Tell players how long evidence is retained in your jurisdiction. Browser MAC addresses are unavailable; the moderation service uses a salted canvas/audio/user-agent/timezone fingerprint hash as a practical substitute. Review local privacy and recording law before enabling voice.

## 5. Backups

Create a nightly Postgres backup and retain seven copies:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U rockbottom rockbottom | gzip > "backups/rockbottom-$(date +%F).sql.gz"
find backups -name 'rockbottom-*.sql.gz' -mtime +7 -delete
```

Back up `.env`, enabled pack folders, and `docs/screenshots` separately. Never commit `.env` or character tokens.

Restore into an empty database:

```bash
gunzip -c backups/rockbottom-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U rockbottom rockbottom
docker compose restart server
```

## 6. Update the game

```bash
git fetch --all --prune
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Read release notes before updates. Database migrations should run as a one-shot command before the new server replaces the old one.

## 7. Add or update packs

Place a pack beneath `packs/`, verify its manifest and dependencies against [packs/SCHEMA.md](packs/SCHEMA.md), then rebuild the server image:

```bash
docker compose build server
docker compose up -d server
docker compose logs --tail=100 server
```

The admin pack manager can disable a loaded pack for the next safe world reload. Do not remove a pack that owns active quest state without first migrating affected characters.

## 8. Operations

```bash
docker compose logs -f --tail=200 server caddy
docker compose restart server
docker compose down
docker compose up -d
```

Monitor disk space, Postgres volume growth, moderation evidence retention, and Caddy certificate logs. The default compose limits keep the stack within 8GB, but large public events should lower shard capacity or move Postgres to a separate host.

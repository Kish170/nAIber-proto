# Docker Setup Guide

## Quick Start

Ngrok URLs are fetched automatically on server startup:

```bash
# Just start everything - URLs are fetched automatically!
docker-compose up -d

# View logs to see the URLs
docker-compose logs server
```

## Services

### 1. **Ngrok** (Port Tunneling)
- **Ports:** 4040 (web UI & API)
- **Tunnels:**
  - `server`: Port 3000 → HTTPS URL
  - `llm`: Port 3001 → HTTPS URL
- **Dashboard:** http://localhost:4040

### 2. **Redis** (Session Management)
- **Port:** 6379
- **Data:** Persisted in `redis_data` volume

### 3. **Server** (Main Application)
- **Port:** 3000
- **Dependencies:** ngrok, redis
- **Health check:** `/health`

### 4. **LLM-Server** (Custom LLM Endpoint)
- **Port:** 3001
- **Dependencies:** None

## Ngrok URL Management

The server automatically fetches ngrok URLs from the ngrok API on startup.

**How it works:**
1. Server starts
2. Contacts ngrok API at `http://ngrok:4040/api/tunnels`
3. Fetches current URLs
4. Injects them into `process.env`
5. Ready to use!

**Configuration:**
```bash
# In docker-compose.yml (already configured)
USE_DYNAMIC_NGROK: "true"
NGROK_API_URL: http://ngrok:4040/api/tunnels
```

**Benefits:**
- ✅ Zero manual steps
- ✅ Works after every restart
- ✅ No .env file updates needed
- ✅ Automatic retry logic if ngrok isn't ready yet

**View ngrok URLs:**
- Dashboard: http://localhost:4040
- Server logs: `docker-compose logs server`

## Common Commands

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up ngrok -d

# View logs
docker-compose logs -f server
docker-compose logs -f ngrok

# Restart services (after .env update)
docker-compose restart server

# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes Redis data)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build
```

## Workflow for Development

1. **Start all services:**
   ```bash
   docker-compose up -d
   ```

2. **Verify everything is running:**
   ```bash
   docker-compose ps
   docker-compose logs server  # View ngrok URLs in logs
   ```

## Troubleshooting

### Ngrok URLs not working
- Check ngrok is healthy: `docker-compose ps ngrok`
- View ngrok dashboard: http://localhost:4040
- Verify authtoken in `.env`: `NGROK_AUTH_TOKEN`

### Services can't connect
- Ensure ngrok started before server: `docker-compose restart server`
- Check logs: `docker-compose logs ngrok`

### Redis connection issues
- Verify Redis is running: `docker-compose ps redis`
- Check Redis health: `docker-compose exec redis redis-cli ping`

## Production Deployment

For production, consider:
1. **Use static ngrok domains** (paid feature, no URL changes)
2. **Or switch to proper reverse proxy** (nginx, Caddy)
3. **Use cloud Redis** (Redis Cloud, Upstash)
4. **Deploy to cloud platform** (Railway, Render, AWS)

## Environment Variables

Required in `.env`:
```bash
# Ngrok
NGROK_AUTH_TOKEN=your_token_here

# Note: BASE_URL, TWILIO_URL, and STREAM_URL are automatically
# fetched from ngrok on server startup - no manual configuration needed!
```

## Notes

- **Ngrok URLs change** on every restart (unless using reserved domains)
- **Redis data persists** in Docker volume
- **Database** uses Supabase (cloud, not Docker)
- **Qdrant** uses cloud (not Docker)

Rebuild and restart only the naiber-server container.
Use this when server package code has changed:
```bash
docker compose up --build --no-deps -d naiber-server
```

Then confirm it started cleanly:
```bash
docker logs naiber-server --tail 50
```
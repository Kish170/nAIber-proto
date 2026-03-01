Restart only the naiber-server container without 
rebuilding:
```bash
docker compose restart naiber-server
```

Then tail the logs to confirm it came up cleanly:
```bash
docker logs naiber-server --tail 50 -f
```

Stop following logs with Ctrl+C once you see 
the server is listening on port 3000.
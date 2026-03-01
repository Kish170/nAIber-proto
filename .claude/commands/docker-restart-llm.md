Restart only the naiber-llm-server container 
without rebuilding:
```bash
docker compose restart naiber-llm-server
```

Then tail the logs to confirm it came up cleanly:
```bash
docker logs naiber-llm-server --tail 50 -f
```

Stop following logs with Ctrl+C once you see 
the server is listening on port 3001.s
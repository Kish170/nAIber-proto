Rebuild and restart only the naiber-llm-server 
container. Use this when llm-server package code 
has changed:
```bash
docker compose up --build --no-deps -d naiber-llm-server
```

Then confirm it started cleanly:
```bash
docker logs naiber-llm-server --tail 50
```
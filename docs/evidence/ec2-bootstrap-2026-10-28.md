# EC2 baseline setup — 28/10/2026

User authorized direct setup over SSH. Host: `3.27.169.177`, Ubuntu user, Sydney instance recorded in docs12. No local Docker Desktop/WSL was installed or started.

Actual checks over SSH:

- Ubuntu 24.04.5 LTS, x86_64; RAM 7.6 GiB; root filesystem 38 GiB, initially 36 GiB available.
- Docker Engine 29.9.2; Compose v5.6.1; Docker service active and enabled at boot.
- `docker run --rm hello-world` completed successfully.
- Docker logging driver `local`, rotation 10 MB × 3; live restore enabled. No existing daemon configuration was overwritten.
- `/opt/shopfast` created with owner ubuntu and mode 750.
- Compose PostgreSQL 16.13 and Redis 7.4.8 both healthy; Redis PING returned PONG.
- Named volumes preserve PostgreSQL data and Redis AOF; restart policy unless-stopped.
- Host listeners verified: PostgreSQL `127.0.0.1:5432`, Redis `127.0.0.1:6379`; neither published on public interfaces.
- Random PostgreSQL password generated on server in `/opt/shopfast/.env`, mode 600. No credential was logged or copied to the repository.
- SSH password authentication disabled by existing image configuration; public key enabled. Time synchronization reports yes.

Files: `deploy/bootstrap-ubuntu.sh` and `deploy/compose.infra.yml`. Installed Docker via official apt repository: https://docs.docker.com/engine/install/ubuntu/ . These scripts are for the EC2 host, not workstation execution.

Reopen status:

```bash
cd /opt/shopfast
sudo docker compose -f compose.infra.yml ps
sudo docker compose -f compose.infra.yml logs --tail 30
```

Do not run `down -v`: that removes persistent database volumes. This is baseline infrastructure only: application not deployed, no migrations/seed applied here, no HTTP/HTTPS listener yet. S3/IAM, actual Security Group restrictions/EBS encryption, domain, HTTPS, email provider, deploy/rollback/backup/restore and application load acceptance remain unverified. Existing DB superuser is a bootstrap identity; application deployment must introduce least-privilege application/migration credentials.

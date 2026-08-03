# KidsPiano Project

**Author:** Hồ Công Lượng <hclhcl0@gmail.com>

KidsPiano is a comprehensive web application for piano learning, featuring a game frontend, an admin CMS, a backend API, a MIDI processing microservice, and n8n automation for lesson management.

## Project Architecture

```text
+-------------------+        +-------------------+
|                   |        |                   |
|  piano-frontend   |        |   piano-admin     |
|   (Next.js App)   |        |   (Next.js App)   |
|                   |        |                   |
+--------+----------+        +---------+---------+
         |                             |
         |         +-----------+       |
         +-------->|           |<------+
                   |   NGINX   |
         +-------->|           |<------+
         |         +-----+-----+       |
         |               |             |
+--------+----------+    |   +---------+---------+
|                   |    |   |                   |
|   midi-service    |<---+   |   piano-backend   |
|  (Python FastAPI) |        |  (Node.js/Prisma) |
|                   |        |                   |
+-------------------+        +---------+---------+
                                       |
                                       |
+-------------------+        +---------+---------+
|                   |        |                   |
|       n8n         |------->|     postgres      |
|   (Automation)    |        |    (Database)     |
|                   |        |                   |
+-------------------+        +-------------------+
```

## Service URLs

| Service             | URL                             | Internal Port |
|---------------------|---------------------------------|---------------|
| Game Frontend       | http://play.kidspiano.local     | 3000          |
| CMS Admin           | http://admin.kidspiano.local    | 3001          |
| Backend API         | http://api.kidspiano.local      | 3002          |
| MIDI Microservice   | http://midi.kidspiano.local     | 8000          |
| n8n Automation      | http://n8n.kidspiano.local      | 5678          |

*Note: For local development, map the `.local` domains to `127.0.0.1` in your hosts file, or access the services directly via `localhost` and the exposed Nginx ports.*

## Prerequisites

- **Docker** and **Docker Compose**
- **Node.js** 20+
- **Python** 3.11+
- **Make** (optional, for utilizing the Makefile)

## Quick Start

1. **Clone the repository and set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your specific secrets if necessary
   ```

2. **Build and start the services:**
   ```bash
   make build
   make up
   ```

3. **Run database migrations and seed the database:**
   ```bash
   make migrate
   make seed
   ```

## Local Development vs. Production

### Development
For active development, you may want to run individual services using their respective local development servers (e.g., `npm run dev` or `uvicorn`) rather than relying purely on Docker Compose to have immediate hot-reloading without rebuilding images. Use Docker primarily for backing services like Postgres and n8n during development.

### Production
For production environments, ensure all credentials in `.env` are changed to strong, unique passwords. The provided `docker-compose.yml` uses `restart: unless-stopped` to keep services running reliably.

## n8n Workflow Setup

1. Once the services are running, access n8n at http://n8n.kidspiano.local (or `http://localhost:5678`).
2. Log in with the credentials defined in your `.env` file (`N8N_USER` and `N8N_PASSWORD`).
3. Go to **Workflows** and click **Import from File**.
4. Select the `n8n/midi-upload-workflow.json` file to import the automation pipeline.
5. Make sure the workflow is activated. This workflow automates the processing of MIDI files via the Python microservice and updates lessons on the backend.

## Cloudflare Tunnel Setup (Proxmox VE Notes)

If you are hosting this environment on Proxmox VE and need external access:
1. Set up a Cloudflare Tunnel connector on your Proxmox host or within a dedicated VM/LXC.
2. Map your external domains (e.g., `play.kidspiano.com`) to the internal IP of the VM running this Docker Compose stack, pointing to port 80.
3. Nginx will handle the internal routing based on the hostnames configured in `nginx/conf.d/kidspiano.conf`.

# frametv-art-gallery
frametv-art-gallery is an independent, open-source, self-hosted gallery manager for Samsung The Frame TVs. Not affiliated with Samsung. It lets you create and manage a personal gallery of images, photos, or artworks locally on your TV.

# Installation

## Docker
docker volume create frametv_uploads
docker volume create frametv_db

docker run -d \
  --name frametv \
  -v frametv_uploads:/app/uploads \
  -v frametv_db:/app/instance \
  -p 8000:8000 \
  frametvartgallery:latest

Or use the docker-compose.yml file: https://github.com/mrtncode/frametv-art-gallery/blob/main/docker-compose.yml

# Update
## Docker (docker run)
Pull the latest image and restart the container while keeping your data (persists in volumes)

Docker Compose (recommended):
1. `docker compose pull`
2. `docker compose up -d`

# Techstack
Frontend:
- React.js
- TailwindCSS
- Shadcn/ui
Backend:
- Flask (Python)

# Credits
Speical thanks to https://github.com/billyfw/frame-art-shuffler and https://github.com/xchwarze/samsung-tv-ws-api
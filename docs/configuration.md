# Configuration

[← Back to README](../README.md)

Everything is optional and has a sensible default. Set these as environment variables on the container.

## Data

All state lives under one folder, `FRAME_TV_DATA`. Mount a volume there.

| Path | Contents |
| --- | --- |
| `$FRAME_TV_DATA/uploads/` | Your images |
| `$FRAME_TV_DATA/instance/frametv.db` | SQLite database: gallery, albums, TVs, settings and source keys |
| `$FRAME_TV_DATA/instance/thumbnails/` | Downscaled copies, rebuilt on demand and safe to delete |
| `$FRAME_TV_DATA/instance/discover/` | Discover search cache and import jobs |

Database migrations run automatically when the container starts. **Back up the whole folder before updating.**

## App

| Variable | Default | What it does |
| --- | --- | --- |
| `FRAME_TV_DATA` | `data` (relative to the app) | Where uploads and the database are kept. Use `/data` in Docker. |
| `PORT` | `8000` | Port the web server listens on in the container. |
| `SECRET_KEY` | a built-in placeholder | Signs session cookies. **Set your own.** |
| `MAX_UPLOAD_SIZE_BYTES` | `20971520` (20 MB) | Largest file you can upload. |
| `FRAME_TV_SLIDESHOW` | `1` | Set to `0` to turn off the background slideshow loop. |
| `SLOW_REQUEST_MS` | `300` | Requests slower than this are logged. `0` turns it off. |
| `DISCOVER_CONTACT` | the project URL | An email or URL sent to the Art Institute of Chicago with Discover requests, so it can reach whoever runs this instance. |

## Web server

| Variable | Default | What it does |
| --- | --- | --- |
| `GUNICORN_WORKERS` | `4` | Worker processes. More than one keeps a slow TV from blocking the whole app. |
| `GUNICORN_THREADS` | `16` | Threads per worker. Requests mostly wait on museum APIs and TVs, so threads let many run at once. |
| `GUNICORN_TIMEOUT` | `180` | Seconds before gunicorn kills a worker. Keep it above `FRAME_TV_UPLOAD_DEADLINE`. |

## TV connection

| Variable | Default | What it does |
| --- | --- | --- |
| `FRAME_TV_SOCKET_TIMEOUT` | `8` | Socket timeout for a single read from the TV. |
| `FRAME_TV_CALL_DEADLINE` | `40` | Seconds a normal TV request may take before it is given up on. |
| `FRAME_TV_UPLOAD_DEADLINE` | `120` | Same, for uploads, which push the whole file to the TV. |
| `FRAME_TV_PAIRING_TIMEOUT` | `45` | How long adding a TV waits for you to accept the prompt on the TV. |
| `FRAME_TV_DOWN_COOLDOWN` | `30` | Seconds a TV is skipped after it failed to answer. |
| `FRAME_TV_BUSY_WAIT` | `90` | How long a deliberate action waits behind another operation on the same TV. |
| `FRAME_TV_MAX_PARALLEL_CALLS` | `8` | Concurrent TV requests per worker. |

## Networking

TV discovery uses UDP broadcast, which only works with `network_mode: host`. In bridge mode, publish the port (for example `-p 8000:8000`) and add your TV by IP address in **Settings**.

## Immich

Connect an [Immich](https://immich.app/) server under **Settings → Immich**. Settings are saved as you edit them; restart Frame Gallery to apply them.

# Security

Frame Gallery is built for a trusted home network. It has **no login, users or permissions**: anyone who can open it can control your TVs, upload and delete images, and change settings.

## Deploying safely

- **Keep it on your LAN.** Never publish it on a public IP or forward a port to it.
- **Remote access** should go through a VPN (WireGuard, Tailscale) or a reverse proxy that requires authentication (for example Authelia, Authentik or basic auth in front of Traefik or Caddy).
- **Set `SECRET_KEY`** to a long random value. The built-in default is public.
- **Back up `FRAME_TV_DATA`** before updating. It holds your images and the database.

## What it talks to

| Connection | Purpose |
| --- | --- |
| Your TVs, over the local WebSocket API | Pairing, uploads, playing art. The pairing token is saved in the database. |
| UDP broadcast on your LAN | Finding TVs (host networking only) |
| Museum and art APIs over HTTPS | Discover search, previews and downloads. Downloads are limited to each source's known hosts. |
| `api.github.com` | Checking for a newer release, at most once a day |
| Your Immich server, if configured | Importing photos |

There is no telemetry and no analytics.

## Things to know

- **The API allows any origin (CORS `*`).** This makes local development easy, but it also means a web page open in a browser on your network could call the API. Another reason not to share the network with untrusted devices.
- **No CSRF protection or rate limiting** on the app's own endpoints.

### Discover source keys

Keys for Smithsonian, Flickr, Pixabay and DeviantArt are stored **in plain text** in the SQLite database (`instance/frametv.db`). The API never sends them back to the browser once saved. Anyone with read access to the data volume, or to a backup of it, can read them. Use free keys that grant nothing beyond public search, and revoke them at the source if a backup leaks.

### Immich

The Immich API key is stored the same way, and unlike the Discover keys it **is** returned by the API so the Settings page can show it. Give Frame Gallery a key with read-only access to the albums you want to import.

## Reporting a problem

Open a [private security advisory](https://github.com/bballdavis/Frame-Gallery/security/advisories/new) on this repository. Please don't open a public issue for anything exploitable.

This is a one-person hobby fork, so responses are best effort. If the problem is in the TV connection or other code shared with the [original project](https://github.com/mrtncode/frametv-art-gallery), please report it there as well.

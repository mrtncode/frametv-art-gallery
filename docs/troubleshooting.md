# Troubleshooting

[← Back to README](../README.md)

## Auto-discovery doesn't find my TV

- The TV is on and on the same network as the server.
- The TV is on the same **subnet**. Some routers isolate Wi-Fi from wired networks, or separate VLANs, which blocks discovery.
- Docker runs with `network_mode: host`. Discovery uses UDP broadcast, which bridge mode doesn't pass through. In bridge mode, add the TV by IP address instead.

## The TV gallery shows placeholders instead of thumbnails

The TV stopped answering. Every request to a TV has a deadline, and a TV that misses it is skipped for `FRAME_TV_DOWN_COOLDOWN` seconds so one silent set can't tie up the whole app. The page then falls back to thumbnails already cached on disk.

A Frame serves a single art channel, so requests to one TV are serialised: opening a second connection while another is still being set up makes the TV reject both. A whole page of thumbnails is fetched in one round trip for the same reason.

Deliberate actions (playing, deleting, uploading) ignore the cooldown and still try, so the TV waking up is noticed immediately. If it persists, check the TV is on and reachable, then look for a single `Timeout after …` line in the logs. The skipped requests that follow are deliberately silent.

## "The TV is busy with another request"

Something else was talking to that TV, most often a page of thumbnails still loading. A deliberate action waits up to `FRAME_TV_BUSY_WAIT` seconds before giving up. Nothing changed on the TV, so retry once the other operation finishes.

## Uploading to the TV fails

- Check the TV is on and has free storage for art. Uploads fail when it's full.
- Try uploading the same image with the SmartThings app, which shows a more specific error.

## The TV asks for permission on every upload

On the TV, go to **Device Connection Manager → Access Notification Settings** and choose **First Time Only**.

## A Discover source says "Resting" or "Busy"

Each source has its own request budget so the museums aren't flooded. The source comes back on its own after the time shown. Search results are cached for a day, so repeating a search is free.

## Something else

[Open an issue](https://github.com/bballdavis/Frame-Gallery/issues). If the problem is in the TV connection and also happens on the [original project](https://github.com/mrtncode/frametv-art-gallery), it may be worth reporting there too.

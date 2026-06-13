// API service for TV actions

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface TVGalleryImage {
  content_id: string;
  filename: string;
  date_added: string;
  thumbnail?: string | null; // base64 string when provided by backend
}

export interface TVInfo {
  ip: string;
  name?: string;
  mac?: string;
  delete_other_images_on_upload?: boolean;
}

export class TVError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TVError";
    this.status = status;
  }
}


// Play an already uploaded image on the TV by content_id (filename)
export async function playUploadedImage({ ip, filename }: { ip: string, filename: string }) {
  const res = await fetch(`${API_BASE}/api/tv/play_uploaded`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, filename }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to play uploaded image on TV');
  return await res.json();
}

// TV management (add/get TVs)
export async function getTvs() {
  const res = await fetch(`${API_BASE}/api/tvs`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to get TVs');
  return (await res.json()).tvs;
}

export async function updateTv(ip: string, updates: { delete_other_images_on_upload?: boolean }) {
  const res = await fetch(`${API_BASE}/api/tvs/${encodeURIComponent(ip)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to update TV');
  return await res.json();
}

export async function addTv(tv: { ip: string; name?: string; mac?: string }) {
  const res = await fetch(`${API_BASE}/api/tvs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tv),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add TV');
  return (await res.json()).tvs;
}

export async function removeTv(ip: string) {
  const res = await fetch(`${API_BASE}/api/tvs`, {
    method: 'DELETE',
    body: JSON.stringify({ ip }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove TV');
  return (await res.json()).tvs;
}

export async function removeAllTvImages(ip: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/images`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove all images from TV');
  return (await res.json()).tvs;
}

export async function getTvGalleryImages(ip: string): Promise<TVGalleryImage[]> {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/gallery`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to load TV gallery');
  const data = await res.json();
  return (data.images || []).map((img: any) => ({
    content_id: img.content_id,
    filename: img.filename,
    date_added: img.date_added,
    thumbnail: img.thumbnail || null,
  }));
}

export function getTvGalleryThumbnailUrl(ip: string, contentId: string) {
  return `${API_BASE}/api/tv/${encodeURIComponent(ip)}/gallery/${encodeURIComponent(contentId)}/thumbnail`;
}

// Fetch thumbnails in batches with limited concurrency. Returns map contentId -> base64 string
export async function fetchTvGalleryThumbnails(ip: string, contentIds: string[], concurrency = 6): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let idx = 0;

  async function worker() {
    while (idx < contentIds.length) {
      const i = idx++;
      const cid = contentIds[i];
      try {
        const res = await fetch(getTvGalleryThumbnailUrl(ip, cid));
        if (!res.ok) continue;
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        // convert to base64
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
          binary += String.fromCharCode.apply(null, Array.from(slice));
        }
        out[cid] = btoa(binary);
      } catch (e) {
        // ignore failures per-thumbnail
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, contentIds.length); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

export async function playTvGalleryImage(ip: string, contentId: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/gallery/${encodeURIComponent(contentId)}/play`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to play image');
  return await res.json();
}

export async function deleteTvGalleryImage(ip: string, contentId: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/gallery/${encodeURIComponent(contentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete image');
  return await res.json();
}

export async function sendToTV({payload, brightness, display }: { payload: any, brightness?: number, display?: boolean }) {
  console.log("received payload", payload)
  const res = await fetch(`${API_BASE}/api/tv/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, brightness, display }),
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  console.log("res stat", res.status)
  if (!res.ok) {
    throw new TVError(data?.error || 'Failed to send to TV', res.status);
  }

  return data; // ok, gibt JSON zurück
}

export async function tvPowerOn(ip: string, mac?: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/on`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to power on TV');
  return await res.json();
}

export async function tvPowerOff(ip: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/off`, {
    method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to power off TV');
  return await res.json();
}

export async function tvArtMode(ip: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/artmode`, {
    method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to set art mode');
  return await res.json();
}

export async function tvStatus(ip: string) {
  const res = await fetch(`${API_BASE}/api/tv/${encodeURIComponent(ip)}/status`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to get TV status');
  return await res.json();
}

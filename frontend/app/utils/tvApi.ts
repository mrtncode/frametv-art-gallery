// API service for TV actions

const API_BASE = import.meta.env.VITE_API_URL || '';

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

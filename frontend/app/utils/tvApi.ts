// API service for TV actions

// TV management (add/get TVs)
export async function getTvs() {
  const res = await fetch('/api/tvs');
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to get TVs');
  return (await res.json()).tvs;
}

export async function addTv(tv: { ip: string; name?: string; mac?: string }) {
  const res = await fetch('/api/tvs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tv),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add TV');
  return (await res.json()).tvs;
}

export async function sendToTV({ ip, filename, brightness, display }: { ip: string, filename: string, brightness?: number, display?: boolean }) {
  const res = await fetch('/api/tv/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, filename, brightness, display }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to send to TV');
  return await res.json();
}

export async function tvPowerOn(ip: string, mac?: string) {
  const res = await fetch(`/api/tv/${encodeURIComponent(ip)}/on`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to power on TV');
  return await res.json();
}

export async function tvPowerOff(ip: string) {
  const res = await fetch(`/api/tv/${encodeURIComponent(ip)}/off`, {
    method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to power off TV');
  return await res.json();
}

export async function tvArtMode(ip: string) {
  const res = await fetch(`/api/tv/${encodeURIComponent(ip)}/artmode`, {
    method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to set art mode');
  return await res.json();
}

export async function tvStatus(ip: string) {
  const res = await fetch(`/api/tv/${encodeURIComponent(ip)}/status`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to get TV status');
  return await res.json();
}

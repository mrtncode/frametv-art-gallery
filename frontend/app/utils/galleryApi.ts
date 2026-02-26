// API service for gallery and albums

// --- Provider (Immich/other) API ---
export async function fetchProviderAlbums() {
  const res = await fetch('/api/provider/albums');
  if (!res.ok) throw new Error('Failed to fetch provider albums');
  return (await res.json()).albums;
}

export async function fetchProviderAlbumImages(albumId: string) {
  const res = await fetch(`/api/provider/albums/${encodeURIComponent(albumId)}/images`);
  if (!res.ok) throw new Error('Failed to fetch provider album images');
  return (await res.json()).images;
}

export function getProviderImageStreamUrl(imageId: string, size: string = "fullsize") {
  return `/api/provider/images/${encodeURIComponent(imageId)}/stream?size=${encodeURIComponent(size)}`;
}
export async function fetchImages() {
  const res = await fetch('/api/images');
  if (!res.ok) throw new Error('Failed to fetch images');
  return (await res.json()).images;
}

export async function fetchAlbums() {
  const res = await fetch('/api/albums');
  if (!res.ok) throw new Error('Failed to fetch albums');
  return (await res.json()).albums;
}

export async function createAlbum(name: string) {
  const res = await fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create album');
  return (await res.json()).albums;
}

export async function addImageToAlbum(album: string, image: string) {
  const res = await fetch(`/api/albums/${encodeURIComponent(album)}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add image');
  return (await res.json()).albums;
}

export async function deleteAlbum(album: string) {
  const res = await fetch(`/api/albums/${encodeURIComponent(album)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete album');
  return (await res.json()).albums;
}

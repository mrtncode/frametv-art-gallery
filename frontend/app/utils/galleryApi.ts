// API service for gallery and albums

// Configure separate backend URL via VITE_API_URL in .env. Otherwise use the page's origin (works when Flask serves frontend from same host).
const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

// --- Provider (Immich/other) API ---
export async function fetchProviderAlbums() {
  const res = await fetch(`${API_BASE}/api/provider/albums`);
  //if (!res.ok) throw new Error('Failed to fetch provider albums');
  return (await res.json()).albums;
}

export async function fetchProviderAlbumImages(albumId: string) {
  const res = await fetch(`${API_BASE}/api/provider/albums/${encodeURIComponent(albumId)}/images`);
  if (!res.ok) throw new Error('Failed to fetch provider album images');
  return (await res.json()).images;
}

export function getProviderImageStreamUrl(imageId: string, size: string = "fullsize") {
  return `${API_BASE}/api/provider/images/${encodeURIComponent(imageId)}/stream?size=${encodeURIComponent(size)}`;
}
export async function fetchImages() {
  const res = await fetch(`${API_BASE}/api/images`);
  if (!res.ok) throw new Error('Failed to fetch images');
  return (await res.json()).images;
}

export async function deleteImage(filename: string) {
  const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete image');
  return await res.json();
}

export async function fetchImagesAddedThisMonth() {
  const res = await fetch(`${API_BASE}/api/images/added_this_month`);
  if (!res.ok) throw new Error('Failed to fetch monthly image count');
  return (await res.json()).count;
}

export async function cropImage(filename: string, x: number, y: number, width: number, height: number) {
  const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(filename)}/crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, width, height }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to crop image');
  return (await res.json());
}

export async function fetchAlbums() {
  const res = await fetch(`${API_BASE}/api/albums`);
  if (!res.ok) throw new Error('Failed to fetch albums');
  return (await res.json()).albums;
}

export async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to upload image');

  return await res.json();
}

export async function createAlbum(name: string) {
  const res = await fetch(`${API_BASE}/api/albums`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to create album');
  return (await res.json()).albums;
}

export async function addImageToAlbum(album: string, image: string) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(album)}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add image');
  return (await res.json()).albums;
}

export async function deleteAlbum(album: string) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(album)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete album');
  return (await res.json()).albums;
}

export function getUploadUrl(filename: string) {
  return `${API_BASE}/uploads/${encodeURIComponent(filename)}`;
}

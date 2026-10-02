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
export type ImageSort = 'newest' | 'oldest' | 'name';

export async function fetchImages(options: { q?: string; sort?: ImageSort } = {}) {
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.sort && options.sort !== 'newest') params.set('sort', options.sort);
  const query = params.toString();

  const res = await fetch(`${API_BASE}/api/images${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch images');
  return (await res.json()).images;
}

export function getBackupUrl() {
  return `${API_BASE}/api/backup`;
}

/** Realign the database with the uploads folder and report what moved. */
export async function reconcileImages(): Promise<{
  added: number; removed: number; hashed: number; duplicate_groups: string[][];
}> {
  const res = await fetch(`${API_BASE}/api/images/reconcile`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to reconcile images');
  return await res.json();
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

export async function cropImage(
  filename: string,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
  preset?: string
) {
  const body: any = {};
  
  if (preset) {
    body.preset = preset;
  } else if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    body.x = x;
    body.y = y;
    body.width = width;
    body.height = height;
  } else {
    throw new Error('Must provide either preset or x, y, width, height');
  }
  
  const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(filename)}/crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to crop image');
  return (await res.json());
}

export async function fetchAlbums() {
  const res = await fetch(`${API_BASE}/api/albums`);
  if (!res.ok) throw new Error('Failed to fetch albums');
  return (await res.json()).albums;
}

export async function uploadImage(file: File, albumId?: string | number) {
  const formData = new FormData();
  formData.append('file', file);
  if (albumId !== undefined && albumId !== null && albumId !== '') {
    formData.append('album_id', String(albumId));
  }

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

export async function addImagesToAlbum(album: string, images: string[]) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(album)}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to add images');
  return (await res.json()).albums;
}

export async function fetchAlbum(albumId: string | number) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(String(albumId))}`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch album');
  return (await res.json()).album;
}

export async function removeImageFromAlbum(albumId: string | number, imageId: string | number) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(String(albumId))}/images/${encodeURIComponent(String(imageId))}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove image from album');
  return (await res.json()).album;
}

export async function deleteAlbum(album: string) {
  const res = await fetch(`${API_BASE}/api/albums/${encodeURIComponent(album)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete album');
  return (await res.json()).albums;
}

/**
 * URL of an uploaded image. Pass a width to get a downscaled copy instead of the
 * original — a grid tile does not need a full-resolution artwork. Only 160, 400 and
 * 800 are generated; anything else silently serves the original.
 */
export function getUploadUrl(filename: string, width?: 160 | 400 | 800) {
  const base = `${API_BASE}/uploads/${encodeURIComponent(filename)}`;
  return width ? `${base}?w=${width}` : base;
}

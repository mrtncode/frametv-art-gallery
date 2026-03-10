// API service for external provider config

// support optional base URL (see tvApi/galleryApi)
const API_BASE = import.meta.env.VITE_API_URL || '';

export type ProviderConfig = {
  id?: number;
  provider: string;
  host?: string;
  port?: number;
  api_key?: string;
  enabled?: boolean;
};

export async function getProviders(): Promise<ProviderConfig[]> {
  const res = await fetch(`${API_BASE}/api/providers`);
  if (!res.ok) throw new Error('Failed to fetch providers');
  return (await res.json()).providers;
}

export async function getProvider(provider: string): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/providers/${provider}`);
  if (!res.ok) throw new Error('Failed to fetch provider');
  return await res.json();
}

export async function setProvider(provider: string, config: Partial<ProviderConfig>): Promise<ProviderConfig> {
  const res = await fetch(`${API_BASE}/api/providers/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save provider config');
  return await res.json();
}

export async function deleteProvider(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/providers/${provider}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete provider config');
}

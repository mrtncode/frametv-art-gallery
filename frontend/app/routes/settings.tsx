import React from 'react'
import { getTvs, addTv, removeTv, removeAllTvImages } from '~/utils/tvApi';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { getProviders, setProvider, getProvider, deleteProvider } from '~/utils/providerApi';

import type { ProviderConfig } from '~/utils/providerApi';

interface TV {
  ip: string;
  name?: string;
  mac?: string;
  delete_other_images_on_upload?: boolean;
}

export default function Settings() {
  // TV state
  const [tvs, setTvs] = React.useState<TV[]>([]);
  const [ip, setIp] = React.useState("");
  const [name, setName] = React.useState("");
  const [mac, setMac] = React.useState("");
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showPairModal, setShowPairModal] = React.useState(false);
  const [pairingIp, setPairingIp] = React.useState("");

  // Provider state
  const [immichHost, setImmichHost] = React.useState("");
  const [immichPort, setImmichPort] = React.useState<number | undefined>(undefined);
  const [immichApiKey, setImmichApiKey] = React.useState("");
  const [immichEnabled, setImmichEnabled] = React.useState(false);
  const [providerError, setProviderError] = React.useState("");
  const [providerSaving, setProviderSaving] = React.useState(false);

  // Fetch TVs
  const fetchTvs = React.useCallback(async () => {
    try {
      setTvs(await getTvs());
    } catch {
      setError("Failed to fetch TVs");
    }
  }, []);

  // Fetch and setup providers
  const fetchProviders = React.useCallback(async () => {
    try {
      const data = await getProviders();
      const immich = data.find(p => p.provider === 'immich');
      if (immich) {
        setImmichHost(immich.host || "");
        setImmichPort(immich.port);
        setImmichApiKey(immich.api_key || "");
        setImmichEnabled(!!immich.enabled);
      }
    } catch (e: any) {
      setProviderError(e.message || 'Failed to fetch providers');
    }
  }, []);

  React.useEffect(() => {
    fetchTvs();
    fetchProviders();
  }, [fetchTvs, fetchProviders]);

  // TV handlers
  const handleAddTv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) {
      setError("IP is required");
      return;
    }
    setAdding(true);
    setShowPairModal(true);
    setPairingIp(ip.trim());
    try {
      await addTv({ ip: ip.trim(), name: name.trim() || undefined, mac: mac.trim() || undefined });
      setIp("");
      setName("");
      setMac("");
      setError("");
      await fetchTvs();
      setShowPairModal(false);
      setPairingIp("");
    } catch (e: any) {
      setError(e.message || "Failed to add TV");
      setShowPairModal(false);
      setPairingIp("");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveTv = async (tvIp: string) => {
    try {
      await removeTv(tvIp);
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || "Failed to remove TV");
    }
  };

  const handleRemoveAllImages = async (tvIp: string) => {
    try {
      await removeAllTvImages(tvIp);
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || "Failed to remove all images from TV");
    }
  };

  const handleToggleDeleteOthers = async (tvIp: string, value: boolean) => {
    try {
      await fetch(`/api/tvs/${encodeURIComponent(tvIp)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_other_images_on_upload: value }),
      });
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || 'Failed to update TV setting');
    }
  };

  // Provider handlers
  const handleSaveImmich = async (e: React.FormEvent) => {
    e.preventDefault();
    setProviderSaving(true);
    setProviderError("");
    try {
      await setProvider('immich', {
        host: immichHost,
        port: immichPort,
        api_key: immichApiKey,
        enabled: immichEnabled,
      });
      await fetchProviders();
      alert("Successfully saved Immich config - Restart Frame Gallery to apply all changes.");
    } catch (e: any) {
      setProviderError(e.message || 'Failed to save Immich config');
    } finally {
      setProviderSaving(false);
    }
  };

  const handleDeleteImmich = async () => {
    setProviderSaving(true);
    setProviderError("");
    try {
      await deleteProvider('immich');
      setImmichHost("");
      setImmichPort(undefined);
      setImmichApiKey("");
      setImmichEnabled(false);
      await fetchProviders();
    } catch (e: any) {
      setProviderError(e.message || 'Failed to delete Immich config');
    } finally {
      setProviderSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 w-full">
      {/* Pairing Modal */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full sm:w-auto flex flex-col items-center">
            <h3 className="text-lg font-semibold mb-2">Pairing TV</h3>
            <p className="mb-4 text-gray-700 text-center">Please accept the pairing request on your TV ({pairingIp}) to complete the process.</p>
            <Button onClick={() => { setShowPairModal(false); setPairingIp(""); setAdding(false); }} className="bg-gray-300 text-gray-700">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="w-full px-4 mx-auto sm:max-w-2xl lg:max-w-4xl">
        <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-gray-800">TV Settings</h1>

        {/* Add TV Section */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Add a New TV</h2>
          <form onSubmit={handleAddTv} className="flex flex-col sm:flex-row gap-3 mb-3">
            <Input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="IP address" required />
            <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" />
            <Input type="text" value={mac} onChange={e => setMac(e.target.value)} placeholder="MAC (optional)" />
            <Button className="bg-blue-600 hover:bg-blue-900 disabled:opacity-50 sm:w-auto" disabled={adding}>
              {adding ? 'Adding…' : 'Add TV'}
            </Button>
          </form>
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </div>

        {/* TVs List */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Your TVs</h2>
          {tvs.length === 0 ? (
            <div className="text-gray-400 text-center">No TVs added yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tvs.map((tv) => (
                <div key={tv.ip} className="bg-white shadow-md rounded-xl p-5 border border-gray-200">
                  <div className="mb-4">
                    {tv.name && <div className="font-semibold text-gray-700">{tv.name}</div>}
                    <div className="font-mono text-blue-700">{tv.ip}</div>
                    {tv.mac && <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded inline-block mt-2">{tv.mac}</div>}
                  </div>

                  <label className="flex items-center gap-2 text-sm mb-4">
                    <input
                      type="checkbox"
                      checked={!!tv.delete_other_images_on_upload}
                      onChange={e => handleToggleDeleteOthers(tv.ip, e.target.checked)}
                      className="accent-blue-600"
                    />
                    <span>Delete other images on upload</span>
                  </label>

                  <div className="flex flex-col gap-2">
                    <button onClick={() => handleRemoveAllImages(tv.ip)} className="text-red-500 hover:text-red-700 text-sm font-medium">
                      Delete all Images from TV
                    </button>
                    <Button onClick={() => handleRemoveTv(tv.ip)} className="bg-red-500 hover:bg-red-600 w-full">
                      Remove TV
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Provider Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">External Providers</h2>
          <form onSubmit={handleSaveImmich} className="flex flex-col gap-3 max-w-lg">
            <div className="font-semibold text-gray-700">Immich</div>
            <Input
              type="text"
              value={immichHost}
              onChange={e => setImmichHost(e.target.value)}
              placeholder="Immich Host (e.g. immich.example.com)"
              required={immichEnabled}
            />
            <Input
              type="number"
              value={immichPort === undefined ? '' : immichPort}
              onChange={e => setImmichPort(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Port (default 443)"
            />
            <Input
              type="text"
              value={immichApiKey}
              onChange={e => setImmichApiKey(e.target.value)}
              placeholder="Immich API Key"
              required={immichEnabled}
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={immichEnabled}
                onChange={e => setImmichEnabled(e.target.checked)}
                className="accent-blue-600"
              />
              <span>Enable Immich</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-900" disabled={providerSaving}>
                {providerSaving ? 'Saving…' : 'Save Immich Config'}
              </Button>
              <Button type="button" className="bg-gray-300 text-gray-700" onClick={handleDeleteImmich} disabled={providerSaving}>
                Delete Config
              </Button>
            </div>
            {providerError && <div className="text-red-500 text-sm mt-1">{providerError}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

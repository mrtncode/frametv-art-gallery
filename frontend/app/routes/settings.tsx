import React from 'react'
import { getTvs, addTv, removeTv, removeAllTvImages } from '~/utils/tvApi';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { getProviders, setProvider, getProvider, deleteProvider } from '~/utils/providerApi';

import type { ProviderConfig } from '~/utils/providerApi';

export default function Settings() {
    // Provider config state
    const [providers, setProviders] = React.useState<ProviderConfig[]>([]);
    const [immichHost, setImmichHost] = React.useState("");
    const [immichPort, setImmichPort] = React.useState<number|undefined>(undefined);
    const [immichApiKey, setImmichApiKey] = React.useState("");
    const [immichEnabled, setImmichEnabled] = React.useState(false);
    const [providerError, setProviderError] = React.useState("");
    const [providerSaving, setProviderSaving] = React.useState(false);

    async function fetchProviders() {
      try {
        const data = await getProviders();
        setProviders(data);
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
    }

    React.useEffect(() => {
      fetchProviders();
    }, []);

    async function handleSaveImmich(e: React.FormEvent) {
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
    }

    async function handleDeleteImmich() {
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
    }
  const [tvs, setTvs] = React.useState<{ ip: string; name?: string; mac?: string; delete_other_images_on_upload?: boolean }[]>([]);
  const [ip, setIp] = React.useState("");
  const [name, setName] = React.useState("");
  const [mac, setMac] = React.useState("");
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showPairModal, setShowPairModal] = React.useState(false);
  const [pairingIp, setPairingIp] = React.useState("");

  async function fetchTvs() {
    try {
      const fetchedTvs = await getTvs();
      setTvs(fetchedTvs);
    } catch (error) {
      setError("Failed to fetch TVs");
    }
  }

  React.useEffect(() => {
    fetchTvs();
  }, []);

  async function handleAddTv(e: React.FormEvent) {
    e.preventDefault();
    if (!ip.trim()) { setError("IP is required"); return; }
    setAdding(true);
    setShowPairModal(true);
    setPairingIp(ip.trim());
    try {
      await addTv({ ip: ip.trim(), name: name.trim() || undefined, mac: mac.trim() || undefined });
      setIp(""); setName(""); setMac(""); setError("");
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
  }

  async function handleRemoveTv(ip: string) {
    try {
      await removeTv(ip);
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || "Failed to remove TV");
    }
  }

  async function handleRemoveAllTvImages(ip: string) {
    try {
      await removeAllTvImages(ip);
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || "Failed to remove all images from TV");
    }
  }

  async function handleToggleDeleteOthers(ip: string, value: boolean) {
    try {
      await fetch(`/api/tvs/${encodeURIComponent(ip)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_other_images_on_upload: value }),
      });
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || 'Failed to update TV setting');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 w-full">
      {showPairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full flex flex-col items-center">
            <h3 className="text-lg font-semibold mb-2">Pairing TV</h3>
            <p className="mb-4 text-gray-700 text-center">Please accept the pairing request on your TV ({pairingIp}) to complete the process.</p>
            <div className="flex gap-2">
              <Button onClick={() => { setShowPairModal(false); setPairingIp(""); setAdding(false); }} className="bg-gray-300 text-gray-700">Cancel</Button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full px-4 mx-auto md:max-w-2xl lg:max-w-4xl overflow-x-auto">
        <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-gray-800">TV Settings</h1>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Add a New TV</h2>
          <form onSubmit={handleAddTv} className="flex flex-col md:flex-row md:flex-wrap gap-3 mb-3 w-full overflow-x-auto">
            <Input
              type="text"
              value={ip}
              onChange={e => setIp(e.target.value)}
              placeholder="IP address"
              className="grow min-w-0 md:w-1/4"
              required
            />
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name (optional)"
              className="grow min-w-0 md:w-1/4"
            />
            <Input
              type="text"
              value={mac}
              onChange={e => setMac(e.target.value)}
              placeholder="MAC (optional)"
              className="grow min-w-0 md:w-1/4"
            />

            <Button
              className="bg-blue-600 hover:bg-blue-900 transition disabled:opacity-50 md:w-auto"
              disabled={adding}
            >
              {adding ? 'Adding…' : 'Add TV'}
            </Button>
          </form>
          {error && <div className="text-red-500 mt-1 text-sm">{error}</div>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Your TVs</h2>
          {tvs.length === 0 ? (
            <div className="text-gray-400 text-center">No TVs added yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tvs.map((tv) => (
                <div key={tv.ip} className="bg-white shadow-md rounded-xl p-5 flex flex-col gap-3 border border-gray-200">
                  <div className="flex items-center gap-3">
                    {tv.name && <span className="text-gray-700 font-semibold text-base text-center">{tv.name}</span>}
                    <br />
                    <span className="font-mono text-blue-700 text-lg text-center">{tv.ip}</span>
                    {tv.mac && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{tv.mac}</span>}
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="text-xs text-gray-500">Options:</span>
                        <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!tv.delete_other_images_on_upload}
                          onChange={e => handleToggleDeleteOthers(tv.ip, e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span>Delete other images on upload (managed mode)</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col justify-end mt-2 gap-3">
                    <button onClick={() => handleRemoveAllTvImages(tv.ip)} className="text-red-500 hover:text-red-700 font-medium ml-2">Delete all Images from TV</button>
                    <button onClick={() => handleRemoveTv(tv.ip)} className="text-white bg-red-500 px-3 py-2 rounded-xl hover:text-red-700 font-medium">Remove TV</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white mt-4 rounded-2xl border border-gray-200 p-5">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">External Providers</h2>
          <form onSubmit={handleSaveImmich} className="flex flex-col gap-3 max-w-lg">
            <div className="font-semibold text-gray-700 mb-1">Immich</div>
            <Input
              type="text"
              value={immichHost}
              onChange={e => setImmichHost(e.target.value)}
              placeholder="Immich Host (e.g. immich.example.com)"
              className=""
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
            <div
              className={`flex flex-wrap gap-2 mt-2 ${
              window.innerWidth < 640 ? 'flex-col items-center' : ''
              }`}
            >
              <Button type="submit" className={`bg-blue-600 hover:bg-blue-900 ${window.innerWidth < 640 ? 'w-[90%] mx-auto' : ''}`} disabled={providerSaving} >
                {providerSaving ? 'Saving…' : 'Save Immich Config'}
              </Button>
              <Button type="button" className={`bg-gray-300 text-gray-700 ${window.innerWidth < 640 ? 'w-[90%] mx-auto' : ''}`}  onClick={handleDeleteImmich} disabled={providerSaving}>
                Delete Config
              </Button>
            </div>
            {providerError && <div className="text-red-500 text-sm mt-1">{providerError}</div>}
          </form>
        </div>
      </div>
    </div>
  )
}

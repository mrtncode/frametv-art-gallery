import React from 'react'
import { getTvs, addTv, removeTv } from '~/utils/tvApi';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';

export default function Settings() {
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
              className="flex-grow min-w-0 md:w-1/4"
              required
            />
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name (optional)"
              className="flex-grow min-w-0 md:w-1/4"
            />
            <Input
              type="text"
              value={mac}
              onChange={e => setMac(e.target.value)}
              placeholder="MAC (optional)"
              className="flex-grow min-w-0 md:w-1/4"
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
            <ul className="divide-y divide-gray-100">
              {tvs.map((tv) => (
                <li key={tv.ip} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-gray-800 text-base">{tv.ip}</span>
                    {tv.name && <span className="ml-2 text-gray-700 font-medium">{tv.name}</span>}
                    {tv.mac && <span className="ml-2 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{tv.mac}</span>}
                    <label className="ml-4 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!tv.delete_other_images_on_upload}
                        onChange={e => handleToggleDeleteOthers(tv.ip, e.target.checked)}
                        className="accent-blue-600"
                      />
                      Delete other images on upload
                    </label>
                  </div>
                  <button onClick={() => handleRemoveTv(tv.ip)} className="text-red-500 hover:text-red-700">Delete</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

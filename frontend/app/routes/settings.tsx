import React from 'react'
import { getTvs, addTv } from '~/utils/tvApi';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';

export default function Settings() {
  const [tvs, setTvs] = React.useState<{ ip: string; name?: string; mac?: string }[]>([]);
  const [ip, setIp] = React.useState("");
  const [name, setName] = React.useState("");
  const [mac, setMac] = React.useState("");
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);

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
    try {
      await addTv({ ip: ip.trim(), name: name.trim() || undefined, mac: mac.trim() || undefined });
      setIp(""); setName(""); setMac(""); setError("");
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || "Failed to add TV");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-50 w-full">
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

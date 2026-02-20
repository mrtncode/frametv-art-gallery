import React from 'react'
import { getTvs, addTv } from '~/utils/tvApi';

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
    <div>
      <h1>Manage TVs</h1>
      <form onSubmit={handleAddTv} className="flex gap-2 items-end mb-4">
        <input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="IP address" className="border px-2 py-1 rounded" />
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" className="border px-2 py-1 rounded" />
        <input type="text" value={mac} onChange={e => setMac(e.target.value)} placeholder="MAC (optional)" className="border px-2 py-1 rounded" />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded" disabled={adding}>Add TV</button>
      </form>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <ul>
        {tvs.map((tv) => (
          <li key={tv.ip}>{tv.ip} {tv.name && `(${tv.name})`} {tv.mac && `[${tv.mac}]`}</li>
        ))}
      </ul>
    </div>
  )
}

import React from 'react'
import { Link } from 'react-router'
import { getTvs, addTv, removeTv, removeAllTvImages, updateTv, discoverTvs, type TVUpdate, type DiscoveredTV } from '~/utils/tvApi';
import { fetchAlbums } from '~/utils/galleryApi';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { getProviders, setProvider, getProvider, deleteProvider } from '~/utils/providerApi';
import { getBackupUrl, reconcileImages } from '~/utils/galleryApi';
import { toast } from 'sonner';

import type { ProviderConfig } from '~/utils/providerApi';
import { SparkleIcon, SparklesIcon } from 'lucide-react';
import { MATTE_STYLES, MATTE_COLORS, splitMatte, combineMatte } from '~/utils/matte';

interface TV {
  ip: string;
  name?: string;
  mac?: string;
  delete_other_images_on_upload?: boolean;
  one_slot_mode?: boolean;
  slideshow_enabled?: boolean;
  slideshow_album_id?: number | null;
  slideshow_interval_minutes?: number | null;
  default_matte?: string | null;
}

export default function Settings() {
  // TV state
  const [tvs, setTvs] = React.useState<TV[]>([]);
  const [ip, setIp] = React.useState("");
  const [name, setName] = React.useState("");
  const [mac, setMac] = React.useState("");
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [discovering, setDiscovering] = React.useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = React.useState(false);
  const [showPairModal, setShowPairModal] = React.useState(false);
  const [pairingIp, setPairingIp] = React.useState("");
  const [discoveredTvs, setDiscoveredTvs] = React.useState<DiscoveredTV[]>([]);

  // Provider state
  const [immichHost, setImmichHost] = React.useState("");
  const [immichPort, setImmichPort] = React.useState<number | undefined>(undefined);
  const [immichApiKey, setImmichApiKey] = React.useState("");
  const [immichEnabled, setImmichEnabled] = React.useState(false);
  const [providerError, setProviderError] = React.useState("");
  const [providerSaving, setProviderSaving] = React.useState(false);

  // Albums feed the slideshow picker.
  const [albums, setAlbums] = React.useState<{ id: string; name: string }[]>([]);

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
    fetchAlbums().then(setAlbums).catch(() => setAlbums([]));
  }, [fetchTvs, fetchProviders]);

  // TV handlers
  const submitAddTv = async (values?: { ip?: string; name?: string; mac?: string }) => {
    const nextIp = (values?.ip ?? ip).trim();
    const nextName = (values?.name ?? name).trim();
    const nextMac = (values?.mac ?? mac).trim();

    if (!nextIp) {
      setError("IP is required");
      return;
    }

    setAdding(true);
    setShowPairModal(true);
    setPairingIp(nextIp);
    setError("");

    try {
      await addTv({ ip: nextIp, name: nextName || undefined, mac: nextMac || undefined });
      setIp("");
      setName("");
      setMac("");
      await fetchTvs();
      setDiscoveredTvs([]);
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

  const handleAddTv = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitAddTv();
  };

  const handleDiscoverTvs = async () => {
    setError("");
    setDiscovering(true);
    try {
      const discovered = await discoverTvs();
      setDiscoveredTvs(discovered);
      if (!discovered.length) {
        toast.info('No Samsung TVs were found on the local network. Make sure they are powered on and connected to the same network and the same subnet. Make sure you are using the correct network mode in Docker.', { position: 'top-center' });
      }
    } catch (e: any) {
      setError(e.message || "Failed to discover TVs");
    } finally {
      setDiscovering(false);
    }
  };

  const handleSelectDiscoveredTv = (tv: DiscoveredTV) => {
    const nextName = tv.name || "";
    const nextMac = tv.mac || "";
    setIp(tv.ip);
    setName(nextName);
    setMac(nextMac);

    const label = nextName || tv.ip;
    const shouldSubmit = window.confirm(`Want to add ${label} (${tv.ip}) or make changes to the name/MAC before adding?\nPress OK to add now, or Cancel to edit the fields.`);
    if (!shouldSubmit) return;

    void submitAddTv({ ip: tv.ip, name: nextName, mac: nextMac });
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
      await updateTv(tvIp, { delete_other_images_on_upload: value });
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || 'Failed to update TV setting');
    }
  };

  const handleToggleOneSlotMode = async (tvIp: string, value: boolean) => {
    try {
      await updateTv(tvIp, { one_slot_mode: value });
      await fetchTvs();
    } catch (e: any) {
      setError(e.message || 'Failed to update TV setting');
    }
  };

  const handleSlideshow = async (tvIp: string, updates: TVUpdate) => {
    setError('');
    try {
      await updateTv(tvIp, updates);
    } catch (e: any) {
      setError(e.message || 'Failed to update the slideshow');
    } finally {
      // Refetched either way, so a rejected change does not linger in the form.
      await fetchTvs();
    }
  };

  const handleDefaultMatte = async (tvIp: string, matte: string) => {
    setError('');
    try {
      await updateTv(tvIp, { default_matte: matte });
    } catch (e: any) {
      setError(e.message || 'Failed to update the default matte');
    } finally {
      await fetchTvs();
    }
  };

  const handleReconcile = async () => {
    setMaintenanceBusy(true);
    setError('');
    try {
      const report = await reconcileImages();
      const parts = [`${report.added} added`, `${report.removed} removed`, `${report.hashed} hashed`];
      if (report.duplicate_groups.length) {
        parts.push(`${report.duplicate_groups.length} duplicate group${report.duplicate_groups.length === 1 ? '' : 's'}`);
      }
      toast.success(`Library checked: ${parts.join(', ')}`, { position: 'top-center', duration: 8000 });
    } catch (e: any) {
      setError(e.message || 'Failed to check the library');
    } finally {
      setMaintenanceBusy(false);
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
    <div className="min-h-screen flex flex-col items-center bg-background w-full">
      {/* Pairing Modal */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl shadow-lg p-6 max-w-md w-full sm:w-auto flex flex-col items-center">
            <h3 className="text-lg font-semibold mb-2">Pairing TV</h3>
            <p className="mb-4 text-foreground text-center">Please accept the pairing request on your TV ({pairingIp}) to complete the process.</p>
            <Button onClick={() => { setShowPairModal(false); setPairingIp(""); setAdding(false); }} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="w-full px-4 mx-auto sm:max-w-2xl lg:max-w-4xl">
        <h1 className="text-2xl font-bold mb-6 mt-3 text-center text-foreground">TV Settings</h1>

        {/* Add TV Section */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Add a New TV</h2>
            <Button
              type="button"
              onClick={handleDiscoverTvs}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              disabled={discovering}
            >
              {discovering ? 'Discovering…' : 'Auto Discover TVs'}
              <SparklesIcon className="h-4 w-4" />
            </Button>
          </div>

          {discoveredTvs.length > 0 && (
            <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 text-sm font-medium text-foreground">Discovered on your network</div>
              <div className="space-y-2">
                {discoveredTvs.map((tv) => (
                  <button
                    key={`${tv.ip}-${tv.name || tv.mac || 'tv'}`}
                    type="button"
                    onClick={() => handleSelectDiscoveredTv(tv)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition hover:border-blue-400 hover:bg-blue-50/5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{tv.name || 'Samsung TV'}</span>
                      {tv.is_frame && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Frame
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{tv.ip}</div>
                    {tv.mac && <div className="text-xs text-muted-foreground">{tv.mac}</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAddTv} className="flex flex-col sm:flex-row gap-3 mb-3">
            <Input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="IP address" required />
            <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" />
            <Input type="text" value={mac} onChange={e => setMac(e.target.value)} placeholder="MAC (optional)" />
            <Button className="bg-blue-600 text-white hover:bg-blue-900 disabled:opacity-50 sm:w-auto" disabled={adding}>
              {adding ? 'Adding…' : 'Add TV'}
            </Button>
          </form>
          {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </div>

        {/* TVs List */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Your TVs</h2>
          {tvs.length === 0 ? (
            <div className="text-muted-foreground text-center">No TVs added yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tvs.map((tv) => {
                const { style: matteStyle, color: matteColor } = splitMatte(tv.default_matte);
                return (
                <div key={tv.ip} className="bg-card shadow-md rounded-xl p-5 border border-border">
                  <div className="mb-4">
                    {tv.name && <div className="font-semibold text-foreground">{tv.name}</div>}
                    <div className="font-mono text-blue-700 dark:text-blue-400">{tv.ip}</div>
                    {tv.mac && <div className="text-xs bg-muted text-foreground px-2 py-1 rounded inline-block mt-2">{tv.mac}</div>}
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

                  <label className="flex items-start gap-2 text-sm mb-4">
                    <input
                      type="checkbox"
                      checked={!!tv.one_slot_mode}
                      onChange={e => handleToggleOneSlotMode(tv.ip, e.target.checked)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span>
                      1-slot mode (auto overwrite managed image)
                      <span className="block text-xs text-gray-500">
                        Keeps only one image uploaded by this app on the TV. Other TV images are left untouched.
                      </span>
                    </span>
                  </label>

                  <fieldset className="mb-4 border border-gray-200 rounded-lg p-3">
                    <legend className="text-sm font-medium px-1">Slideshow</legend>
                    <p className="text-xs text-gray-500 mb-2">
                      Rotates through images of an album that are already on this TV. It only
                      moves art that is already on screen, so it never interrupts what you are
                      watching.
                    </p>
                    <div className="flex flex-col gap-2">
                      <select
                        value={tv.slideshow_album_id ?? ''}
                        onChange={e => handleSlideshow(tv.ip, { slideshow_album_id: e.target.value || null })}
                        aria-label="Slideshow album"
                        className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">No album</option>
                        {albums.map(album => (
                          <option key={album.id} value={album.id}>{album.name}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={tv.slideshow_interval_minutes ?? ''}
                          onChange={e => handleSlideshow(tv.ip, { slideshow_interval_minutes: e.target.value || null })}
                          placeholder="Every … minutes"
                          aria-label="Slideshow interval in minutes"
                        />
                        <span className="text-sm text-gray-500 whitespace-nowrap">min</span>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!tv.slideshow_enabled}
                          onChange={e => handleSlideshow(tv.ip, { slideshow_enabled: e.target.checked })}
                          className="accent-blue-600"
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="mb-4 border border-gray-200 rounded-lg p-3">
                    <legend className="text-sm font-medium px-1">Default matte</legend>
                    <p className="text-xs text-gray-500 mb-2">
                      Used for anything sent to this TV without a matte of its own.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={matteStyle}
                        onChange={e => handleDefaultMatte(tv.ip, combineMatte(e.target.value, matteColor))}
                        aria-label="Default matte style"
                        className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        {MATTE_STYLES.map(style => (
                          <option key={style} value={style}>{style === 'none' ? 'No matte' : style}</option>
                        ))}
                      </select>
                      <select
                        value={matteColor}
                        onChange={e => handleDefaultMatte(tv.ip, combineMatte(matteStyle, e.target.value))}
                        disabled={matteStyle === 'none'}
                        aria-label="Default matte color"
                        className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                      >
                        {MATTE_COLORS.map(color => (
                          <option key={color} value={color}>{color}</option>
                        ))}
                      </select>
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-2">
                    <Link to={`/tv-gallery?ip=${encodeURIComponent(tv.ip)}`} className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg text-center">
                      View Gallery
                    </Link>
                    <button onClick={() => handleRemoveAllImages(tv.ip)} className="text-red-500 hover:text-red-700 text-sm font-medium">
                      Delete all Images from TV
                    </button>
                    <Button onClick={() => handleRemoveTv(tv.ip)} className="bg-red-500 text-white hover:bg-red-600 w-full">
                      Remove TV
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Library */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Library</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={getBackupUrl()}
              className="bg-blue-600 text-white hover:bg-blue-900 text-sm font-medium py-2 px-4 rounded-lg text-center"
            >
              Download a backup
            </a>
            <Button onClick={handleReconcile} disabled={maintenanceBusy}>
              {maintenanceBusy ? 'Checking…' : 'Check the library'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            The backup is a zip of your uploads and the database — take one before updating.
            Checking the library picks up files added or removed outside the app, fills in the
            hashes of images uploaded before this existed, and reports any stored twice under
            different names.
          </p>
        </div>

        {/* Provider Settings */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4 text-foreground">External Providers</h2>
          <form onSubmit={handleSaveImmich} className="flex flex-col gap-3 max-w-lg">
            <div className="font-semibold text-foreground">Immich</div>
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
              <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-900" disabled={providerSaving}>
                {providerSaving ? 'Saving…' : 'Save Immich Config'}
              </Button>
              <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={handleDeleteImmich} disabled={providerSaving}>
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

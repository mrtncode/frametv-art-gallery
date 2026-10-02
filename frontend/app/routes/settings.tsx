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
import { SparklesIcon, PencilIcon, ImagesIcon, PlusIcon } from 'lucide-react';
import { splitMatte } from '~/utils/matte';
import { Switch } from '~/components/ui/switch';
import { TvEditModal, type TV } from '~/components/TvEditModal';

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
  const [editingIp, setEditingIp] = React.useState<string | null>(null);
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

      <div className="w-full px-4 pt-6 mx-auto sm:max-w-2xl lg:max-w-4xl">
        <h1 className="sr-only">Settings</h1>

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
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition hover:border-primary/60 hover:bg-selection/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{tv.name || 'Samsung TV'}</span>
                      {tv.is_frame && (
                        <span className="rounded bg-selection px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-selection-foreground">
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
            <Button size="icon" aria-label="Add TV" title="Add TV" className="bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 sm:shrink-0" disabled={adding}>
              <PlusIcon className="h-4 w-4" />
            </Button>
          </form>
          {error && <div className="text-destructive text-sm mt-1">{error}</div>}
        </div>

        {/* TVs List */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Your TVs</h2>
          {tvs.length === 0 ? (
            <div className="text-muted-foreground text-center">No TVs added yet.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {tvs.map((tv) => {
                const { style: matteStyle, color: matteColor } = splitMatte(tv.default_matte);
                const album = albums.find(a => String(a.id) === String(tv.slideshow_album_id));
                const chips: string[] = [];
                if (tv.slideshow_enabled && album) {
                  chips.push(`Slideshow: ${album.name}${tv.slideshow_interval_minutes ? ` · ${tv.slideshow_interval_minutes} min` : ''}`);
                } else {
                  chips.push('Slideshow off');
                }
                chips.push(matteStyle === 'none' ? 'No matte' : `Matte: ${matteStyle} · ${matteColor}`);
                if (tv.one_slot_mode) chips.push('1-slot mode');
                if (tv.delete_other_images_on_upload) chips.push('Replaces on upload');
                return (
                  <li key={tv.ip} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-semibold text-foreground">{tv.name || tv.ip}</span>
                        {tv.name && <span className="font-mono text-sm text-primary">{tv.ip}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tv.mac && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{tv.mac}</span>}
                        {chips.map(chip => (
                          <span key={chip} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{chip}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" size="icon" onClick={() => setEditingIp(tv.ip)} aria-label={`Edit ${tv.name || tv.ip}`} title="Edit" className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                        <PencilIcon className="h-4 w-4" />
                      </Button>
                      <Link to={`/tv-gallery?ip=${encodeURIComponent(tv.ip)}`} aria-label={`View gallery for ${tv.name || tv.ip}`} title="View gallery" className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover">
                        <ImagesIcon className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <TvEditModal
          tv={tvs.find(t => t.ip === editingIp) ?? null}
          albums={albums}
          onClose={() => setEditingIp(null)}
          onUpdate={(tvIp, updates) => { void handleSlideshow(tvIp, updates); }}
          onRemoveAllImages={handleRemoveAllImages}
          onRemove={handleRemoveTv}
        />

        {/* Library */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Library</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={getBackupUrl()}
              className="bg-primary text-primary-foreground hover:bg-primary-hover text-sm font-medium py-2 px-4 rounded-lg text-center"
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
            <label className="flex items-center justify-between gap-4">
              <span className="font-semibold text-foreground">Enable Immich</span>
              <Switch checked={immichEnabled} onCheckedChange={setImmichEnabled} aria-label="Enable Immich" />
            </label>
            {immichEnabled && (
              <>
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
              </>
            )}
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary-hover" disabled={providerSaving}>
                {providerSaving ? 'Saving…' : 'Save Immich Config'}
              </Button>
              <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={handleDeleteImmich} disabled={providerSaving}>
                Delete Config
              </Button>
            </div>
            {providerError && <div className="text-destructive text-sm mt-1">{providerError}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

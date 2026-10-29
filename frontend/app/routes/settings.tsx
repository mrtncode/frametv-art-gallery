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
import { CircleNotch as SpinnerIcon, Images as ImagesIcon, Pencil as PencilIcon, Plus as PlusIcon, Sparkle as SparklesIcon, Trash as TrashIcon } from "@phosphor-icons/react";
import { Tooltip } from '~/components/ui/tooltip';
import { splitMatte } from '~/utils/matte';
import { Switch } from '~/components/ui/switch';
import { TvEditModal, type TV } from '~/components/TvEditModal';
import SourceLogo from '~/components/SourceLogo';
import SourceOrderDialog from '~/components/SourceOrderDialog';
import { clearCredentials, fetchSources, saveCredentials, type DiscoverSource } from '~/utils/discoverApi';
import {
  getCustomizeSources,
  getDisabledSources,
  getEnabledFlaggedSources,
  isOptional,
  orderSources,
  setCustomizeSources,
  setSourceOrder,
  getSourceOrder,
  visibleSources,
  setDisabledSources,
  setEnabledFlaggedSources,
} from '~/lib/discoverPrefs';

/** The service's own logo for a row that groups several sources (each source has its museum's icon, not the umbrella's). */
const SERVICE_ICONS: Record<string, string> = {
  smithsonian: "https://www.si.edu/apple-touch-icon.png",
};

/** What to call a group of sources that share one key: the service ("Smithsonian"), or the source itself when alone. */
function groupName(sources: DiscoverSource[]) {
  return sources.length > 1 ? (sources[0].credentials?.label ?? sources[0].name) : sources[0].name;
}

/**
 * One key-needing service that is off until chosen: a switch, and the key form once it is
 * switched on. Sources that share a key (the Smithsonian's two museums) are one row.
 */
function OptionalSource({
  sources,
  on,
  onToggle,
  onSaved,
}: {
  sources: DiscoverSource[];
  on: boolean;
  onToggle: (next: boolean) => void;
  /** Resolves once the sources have been reloaded, so the form can stay busy until the page reflects the change */
  onSaved: () => Promise<unknown>;
}) {
  const source = sources[0];
  const name = groupName(sources);
  const description = sources.length > 1 ? sources.map((s) => s.name).join(" and ") : source.tagline;
  const creds = source.credentials;
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<"" | "saving" | "removing">("");
  const [problem, setProblem] = React.useState("");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!creds || busy) return;
    setBusy("saving");
    setProblem("");
    try {
      await saveCredentials(creds.service, values);
      setValues({});
      await onSaved();
      toast.success(`${creds.label} key saved`);
    } catch (e: any) {
      setProblem(e.message || "Could not save the key");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!creds || busy) return;
    setBusy("removing");
    setProblem("");
    try {
      await clearCredentials(creds.service);
      await onSaved();
    } catch (e: any) {
      setProblem(e.message || "Could not remove the key");
    } finally {
      setBusy("");
    }
  };

  return (
    <li>
      <label className="flex items-center gap-3">
        <SourceLogo source={source} src={sources.length > 1 ? SERVICE_ICONS[creds?.service ?? ""] : undefined} className="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{name}</span>
          <span className="block truncate text-sm text-muted-foreground">{description}</span>
        </span>
        <Switch checked={on} onCheckedChange={onToggle} aria-label={`Use ${name}`} />
      </label>
      {on && creds && (
        <div className="mt-3 ml-12 rounded-xl border border-border bg-muted/40 p-3">
          {creds.configured ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-foreground">{creds.label} key saved. It is kept on this server and never shown again.</p>
              <Button type="button" variant="outline" size="sm" disabled={busy !== ""} onClick={remove}>
                {busy === "removing" && <SpinnerIcon className="animate-spin" aria-hidden="true" />}
                {busy === "removing" ? "Removing…" : "Remove key"}
              </Button>
            </div>
          ) : (
            <form onSubmit={save} aria-busy={busy === "saving"} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {name} needs a free {creds.label} key before it shows up in Discover.{" "}
                <a href={creds.help_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-foreground">
                  Get one
                </a>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {creds.fields.map((field) => (
                  <Input
                    key={field.name}
                    type="password"
                    autoComplete="off"
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    placeholder={field.label}
                    aria-label={`${creds.label} ${field.label}`}
                    disabled={busy !== ""}
                  />
                ))}
                <Button type="submit" disabled={busy !== "" || creds.fields.some((f) => !(values[f.name] ?? "").trim())}>
                  {busy === "saving" && <SpinnerIcon className="animate-spin" aria-hidden="true" />}
                  {busy === "saving" ? "Saving…" : "Save"}
                </Button>
              </div>
              {busy === "saving" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Checking and saving your key. This can take a few seconds.
                </p>
              )}
              {problem && <p className="text-sm text-destructive">{problem}</p>}
            </form>
          )}
          {creds.configured && problem && <p className="mt-2 text-sm text-destructive">{problem}</p>}
        </div>
      )}
    </li>
  );
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
  // What the server last stored, so leaving a field unchanged does not save again.
  const savedImmich = React.useRef("");

  // Albums feed the slideshow picker.
  const [albums, setAlbums] = React.useState<{ id: string; name: string }[]>([]);

  // Discover sources: all on unless the person turned the master switch off and chose.
  const [discoverSources, setDiscoverSources] = React.useState<DiscoverSource[]>([]);
  const [customizeSources, setCustomizeSourcesState] = React.useState(false);
  const [disabledSources, setDisabledState] = React.useState<Set<string>>(new Set());
  // Sources that need a key are off until chosen here.
  const [enabledFlagged, setEnabledFlaggedState] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setCustomizeSourcesState(getCustomizeSources());
    setDisabledState(getDisabledSources());
    setEnabledFlaggedState(getEnabledFlaggedSources());
    fetchSources().then(({ sources }) => setDiscoverSources(sources)).catch(() => setDiscoverSources([]));
  }, []);

  const handleToggleAllSources = (all: boolean) => {
    setCustomizeSourcesState(!all);
    setCustomizeSources(!all);
    if (all) {
      // Back to everything; a source added later is simply on.
      setDisabledState(new Set());
      setDisabledSources(new Set());
    }
  };

  const handleToggleSource = (id: string, on: boolean) => {
    const next = new Set(disabledSources);
    if (on) next.delete(id);
    else next.add(id);
    setDisabledState(next);
    setDisabledSources(next);
  };

  const handleToggleFlagged = (ids: string[], on: boolean) => {
    const next = new Set(enabledFlagged);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setEnabledFlaggedState(next);
    setEnabledFlaggedSources(next);
  };

  const freeSources = discoverSources.filter((s) => !isOptional(s));
  const keyedSources = discoverSources.filter((s) => isOptional(s));
  // One order for every source in use, across both lists above.
  const [orderOpen, setOrderOpen] = React.useState(false);
  const [orderVersion, setOrderVersion] = React.useState(0);
  const inUse = React.useMemo(
    () => orderSources(visibleSources(discoverSources)),
    // The switches live in localStorage, so re-derive when they or the order change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [discoverSources, disabledSources, enabledFlagged, customizeSources, orderVersion]
  );
  const saveOrder = (ids: string[]) => {
    // Sources not shown here (switched off) keep their place, after the ones just ordered.
    setSourceOrder([...ids, ...getSourceOrder().filter((id) => !ids.includes(id))]);
    setOrderVersion((n) => n + 1);
  };
  // Sources that share one key are shown as one row.
  const keyedGroups = React.useMemo(() => {
    const groups = new Map<string, DiscoverSource[]>();
    for (const s of keyedSources) {
      const key = s.credentials?.service ?? s.id;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.values()];
  }, [keyedSources]);
  const reloadSources = () => fetchSources().then(({ sources }) => setDiscoverSources(sources)).catch(() => {});

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
        savedImmich.current = JSON.stringify({ host: immich.host || "", port: immich.port, api_key: immich.api_key || "", enabled: !!immich.enabled });
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

  // Provider handlers. Like the rest of the page, Immich saves as it is changed: the switch
  // straight away, the fields when you leave one (or press Enter), once host and key are both in.
  const saveImmich = async (enabled: boolean) => {
    const config = { host: immichHost.trim(), port: immichPort, api_key: immichApiKey.trim(), enabled };
    if (!config.host || !config.api_key) return;
    const snapshot = JSON.stringify(config);
    if (snapshot === savedImmich.current) return;
    setProviderSaving(true);
    setProviderError("");
    try {
      await setProvider('immich', config);
      savedImmich.current = snapshot;
      toast.success(
        enabled ? 'Immich settings saved. Restart Frame Gallery to apply them.' : 'Immich turned off. Restart Frame Gallery to apply it.',
        { position: 'top-center' },
      );
    } catch (e: any) {
      setProviderError(e.message || 'Failed to save Immich settings');
    } finally {
      setProviderSaving(false);
    }
  };

  const handleToggleImmich = async (enabled: boolean) => {
    setImmichEnabled(enabled);
    await saveImmich(enabled);
  };

  const handleDeleteImmich = async () => {
    if (!window.confirm('Clear the Immich settings? The host, port and API key are removed from this server.')) return;
    setProviderSaving(true);
    setProviderError("");
    try {
      await deleteProvider('immich');
      setImmichHost("");
      setImmichPort(undefined);
      setImmichApiKey("");
      setImmichEnabled(false);
      savedImmich.current = "";
      await fetchProviders();
      toast.success('Immich settings cleared.', { position: 'top-center' });
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
              <PlusIcon weight="regular" className="h-4 w-4" />
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

        {/* Discover */}
        <div className="bg-card rounded-2xl border border-border p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Discover</h2>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-semibold text-foreground">All sources</span>
              <span className="block text-sm text-muted-foreground">
                Search every source that needs no key, and any added later. Turn this off to choose which ones to use.
              </span>
            </span>
            <Switch checked={!customizeSources} onCheckedChange={handleToggleAllSources} aria-label="Use all Discover sources" />
          </label>
          {customizeSources && (
            <ul className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              {freeSources.map((s) => {
                const on = !disabledSources.has(s.id);
                const lastOn = on && freeSources.filter((v) => !disabledSources.has(v.id)).length <= 1;
                return (
                  <li key={s.id}>
                    <label className="flex items-center gap-3">
                      <SourceLogo source={s} className="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{s.name}</span>
                          {s.flagged && (
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Personal use
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">{s.tagline}</span>
                      </span>
                      <Switch
                        checked={on}
                        disabled={lastOn}
                        onCheckedChange={(next) => handleToggleSource(s.id, next)}
                        aria-label={`Use ${s.name}`}
                      />
                    </label>
                  </li>
                );
              })}
              {discoverSources.length === 0 && <li className="text-sm text-muted-foreground">Could not load the sources.</li>}
            </ul>
          )}
          {keyedSources.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="font-semibold text-foreground">Sources that need a key</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                These are off until you turn one on and save its free key from the site.
              </p>
              <ul className="mt-3 flex flex-col gap-4">
                {keyedGroups.map((group) => (
                  <OptionalSource
                    key={group[0].credentials?.service ?? group[0].id}
                    sources={group}
                    on={group.some((s) => enabledFlagged.has(s.id))}
                    onToggle={(next) => handleToggleFlagged(group.map((s) => s.id), next)}
                    onSaved={reloadSources}
                  />
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
            <span>
              <span className="block font-semibold text-foreground">Search order</span>
              <span className="block text-sm text-muted-foreground">
                Choose which sources come first in “All sources” results.
              </span>
            </span>
            <Button type="button" variant="outline" onClick={() => setOrderOpen(true)} disabled={inUse.length < 2}>
              Reorder
            </Button>
          </div>
          <SourceOrderDialog open={orderOpen} sources={inUse} onClose={() => setOrderOpen(false)} onSave={saveOrder} />
        </div>

        {/* Provider Settings */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4 text-foreground">External Providers</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveImmich(immichEnabled);
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold text-foreground">Immich</span>
                <span className="block text-sm text-muted-foreground">Browse and add pictures from your own Immich server.</span>
              </span>
              <Switch checked={immichEnabled} onCheckedChange={handleToggleImmich} aria-label="Enable Immich" />
            </label>
            {/* The fields belong to the switch: they show and hide together. */}
            {immichEnabled && (
              <div className="flex items-center gap-2 border-t border-border pt-4">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <Input
                      type="text"
                      value={immichHost}
                      onChange={e => setImmichHost(e.target.value)}
                      onBlur={() => saveImmich(immichEnabled)}
                      placeholder="Host (e.g. immich.example.com)"
                      aria-label="Immich host"
                    />
                    <Input
                      type="number"
                      value={immichPort === undefined ? '' : immichPort}
                      onChange={e => setImmichPort(e.target.value ? parseInt(e.target.value) : undefined)}
                      onBlur={() => saveImmich(immichEnabled)}
                      placeholder="Port (443)"
                      aria-label="Immich port"
                    />
                  </div>
                  <Input
                    type="text"
                    value={immichApiKey}
                    onChange={e => setImmichApiKey(e.target.value)}
                    onBlur={() => saveImmich(immichEnabled)}
                    placeholder="API key"
                    aria-label="Immich API key"
                  />
                  {/* Enter in a field saves too; this hidden button is what makes it submit. */}
                  <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
                </div>
                <Tooltip label="Clear Immich settings">
                  <button
                    type="button"
                    onClick={handleDeleteImmich}
                    disabled={providerSaving || (!immichHost && !immichApiKey && immichPort === undefined)}
                    aria-label="Clear Immich settings"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-surface hover:text-destructive focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40"
                  >
                    {providerSaving ? <SpinnerIcon className="size-5 animate-spin" aria-hidden="true" /> : <TrashIcon weight="regular" className="size-5" aria-hidden="true" />}
                  </button>
                </Tooltip>
              </div>
            )}
            {providerError && <div className="text-destructive text-sm">{providerError}</div>}
          </form>
        </div>
      </div>
    </div>
  );
}

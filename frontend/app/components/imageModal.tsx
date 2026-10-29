import React from "react";
import { Dialog, Popover, Select } from "radix-ui";
import {
  ArrowSquareOut as ExternalLinkIcon,
  CaretDown as ChevronDownIcon,
  Check as CheckIcon,
  Crop as CropIcon,
  Info as InfoIcon,
  FolderSimplePlus as AlbumAddIcon,
  Play as PlayIcon,
  Power as PowerIcon,
  Trash as TrashIcon,
  UploadSimple as ArrowUpTrayIcon,
  WarningCircle as ExclamationCircleIcon,
  X as XMarkIcon,
} from "@phosphor-icons/react";
import { MATTE_STYLES, MATTE_COLORS, MATTE_STYLE_LABELS, MATTE_COLOR_LABELS, MATTE_SWATCHES } from "../utils/matte";
import { Tooltip } from "./ui/tooltip";
import MattePreview from "./MattePreview";
import { fetchImageSize } from "../utils/galleryApi";

export interface TV {
  ip: string;
  name?: string;
  mac?: string;
  default_matte?: string | null;
  one_slot_mode?: boolean;
}

export interface AlbumOption {
  id: string;
  name: string;
  images: string[];
}

export interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageURL: string;
  alt: string;
  title: string;
  filename?: string;
  image?: any;
  tvs: TV[];
  selectedTvIp: string;
  setSelectedTvIp: (ip: string) => void;
  matteStyle: string;
  setMatteStyle: (style: string) => void;
  matteColor: string;
  setMatteColor: (color: string) => void;
  /** the matte shown is the TV's default, not one picked for this picture */
  matteIsDefault: boolean;
  tvLoading: boolean;
  handleSendToTV: () => void;
  handlePlayUploadedImage: () => void;
  handleTvPowerOn: () => void;
  error: string;
  isLocalImage: boolean;
  onDelete?: () => Promise<void>;
  deleteLoading: boolean;
  onOpenCrop: () => void;
  availableAlbums: AlbumOption[];
  onAssignToAlbum: (albumName: string) => void;
  assigning: boolean;
}

const toolButton =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

const ONE_SLOT_NOTE = "1-Slot Mode: uploading shows this picture and replaces the artwork already on the TV.";

/** The 1-Slot Mode marker: an info icon that explains itself on hover or focus. */
function OneSlotInfo() {
  return (
    <Tooltip label={ONE_SLOT_NOTE}>
      <span
        tabIndex={0}
        aria-label={ONE_SLOT_NOTE}
        // Hovering or tapping the icon explains it; it must not also open the list.
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex shrink-0 rounded-full text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <InfoIcon className="size-4" />
      </span>
    </Tooltip>
  );
}

/** What the picture is and where it came from, labelled, as Discover shows it. */
function ImageDetails({ provenance, size }: { provenance?: any; size: { w: number; h: number } | null }) {
  const fromSource = Boolean(provenance?.source && provenance.source !== "upload");
  let domain = "";
  try {
    domain = provenance?.source_url ? new URL(provenance.source_url).hostname.replace(/^www\./, "") : "";
  } catch {
    // No usable page address.
  }
  const shape = !size ? "" : size.w / size.h > 1.05 ? "Landscape" : size.w / size.h < 0.95 ? "Portrait" : "Square";

  const rows: [string, React.ReactNode][] = [];
  if (fromSource) {
    if (provenance.title) rows.push(["Title", provenance.title]);
    if (provenance.artist) rows.push(["Artist", provenance.artist]);
    rows.push([
      "Source",
      provenance.source_url ? (
        <a
          href={provenance.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          {provenance.source_label}
          {domain && <span className="text-muted-foreground">· {domain}</span>}
          <ExternalLinkIcon weight="regular" className="size-3.5" aria-hidden="true" />
        </a>
      ) : (
        provenance.source_label
      ),
    ]);
    if (provenance.license) rows.push(["License", provenance.license]);
  } else if (provenance) {
    rows.push(["Source", provenance.source === "upload" ? "Uploaded manually" : "Uploaded"]);
  }
  if (size) rows.push(["Size", `${size.w} × ${size.h} px · ${shape}`]);
  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border border-border/70 bg-muted/40 px-3.5 py-3 text-xs">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  imageURL,
  alt,
  title,
  filename,
  image,
  tvs,
  selectedTvIp,
  setSelectedTvIp,
  matteStyle,
  setMatteStyle,
  matteColor,
  setMatteColor,
  matteIsDefault,
  tvLoading,
  handleSendToTV,
  handlePlayUploadedImage,
  handleTvPowerOn,
  error,
  isLocalImage,
  onDelete,
  deleteLoading,
  onOpenCrop,
  availableAlbums,
  onAssignToAlbum,
  assigning,
}) => {
  const [albumsOpen, setAlbumsOpen] = React.useState(false);
  // Delete asks twice: the first press arms it, the second (within a few seconds) deletes.
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  React.useEffect(() => {
    if (!confirmingDelete) return;
    const timer = window.setTimeout(() => setConfirmingDelete(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete]);
  React.useEffect(() => {
    if (!isOpen) setConfirmingDelete(false);
  }, [isOpen]);

  // The picture's own size, for the details. The preview is a downscaled copy, so for an
  // upload the server reads the size from the original's header; anything else is measured
  // from what was loaded. (imageURL changes after a crop, which re-reads it.)
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  React.useEffect(() => {
    if (!isOpen || !imageURL) return;
    let live = true;
    if (isLocalImage && filename) {
      fetchImageSize(filename)
        .then(({ width, height }) => live && setSize({ w: width, h: height }))
        .catch(() => live && setSize(null));
    } else {
      const probe = new Image();
      probe.onload = () => live && setSize({ w: probe.naturalWidth, h: probe.naturalHeight });
      probe.src = imageURL;
    }
    return () => {
      live = false;
    };
  }, [isOpen, imageURL, isLocalImage, filename]);

  const selectedTv = tvs.find((t) => t.ip === selectedTvIp);
  const isOneSlotMode = !!selectedTv?.one_slot_mode;
  const hasTvs = tvs.length > 0;
  const noTv = tvLoading || !selectedTvIp;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Focus the dialog, not its close button, which would open with a focus ring on it.
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className={
            "fixed z-50 flex flex-col overflow-hidden border border-border bg-card text-card-foreground shadow-2xl focus:outline-none " +
            // Phones: a sheet from the bottom. Larger screens: centred, never taller than the window.
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl " +
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[min(60rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl " +
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
          }
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold" title={title}>
                {title}
              </Dialog.Title>
              <Dialog.Description className="truncate text-xs text-muted-foreground" title={filename}>
                {filename || "Image actions"}
              </Dialog.Description>
            </div>
            <Dialog.Close className="-mr-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close">
              <XMarkIcon weight="regular" className="size-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:gap-6">
              {/* The picture, as it will look on the TV */}
              <div className="space-y-3 md:sticky md:top-0 md:self-start">
                <MattePreview
                  imageURL={imageURL}
                  alt={alt}
                  matteStyle={hasTvs ? matteStyle : "none"}
                  matteColor={matteColor}
                />

                {isLocalImage && (
                  <div className={`grid gap-2 ${availableAlbums.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                    <button type="button" className={toolButton} onClick={onOpenCrop}>
                      <CropIcon className="size-[18px]" />
                      Crop
                    </button>

                    {availableAlbums.length > 0 && (
                      <Popover.Root open={albumsOpen} onOpenChange={setAlbumsOpen}>
                        <Popover.Trigger className={toolButton} disabled={assigning}>
                          <AlbumAddIcon className="size-[18px]" />
                          {assigning ? "Adding…" : "Add to album"}
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            align="end"
                            sideOffset={6}
                            collisionPadding={12}
                            className="z-50 max-h-64 w-[var(--radix-popover-trigger-width)] min-w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg focus:outline-none"
                          >
                            {availableAlbums.map((album) => (
                              <button
                                key={album.id}
                                type="button"
                                className="block w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                                onClick={() => {
                                  onAssignToAlbum(album.name);
                                  setAlbumsOpen(false);
                                }}
                              >
                                {album.name}
                              </button>
                            ))}
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    )}
                  </div>
                )}

                <ImageDetails provenance={image?.provenance} size={size} />
              </div>

              {/* Sending it to a TV */}
              <div className="flex flex-col gap-4">
                {hasTvs ? (
                  <>
                    <div className="space-y-1.5">
                      <span id="image-modal-tv" className="text-xs font-medium text-muted-foreground">
                        Frame TV
                      </span>
                      <Select.Root value={selectedTvIp || undefined} onValueChange={setSelectedTvIp} disabled={tvLoading}>
                        <Select.Trigger
                          aria-labelledby="image-modal-tv"
                          className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            <Select.Value placeholder="Select a TV" />
                          </span>
                          {isOneSlotMode && <OneSlotInfo />}
                          <Select.Icon>
                            <ChevronDownIcon weight="regular" className="size-4 text-muted-foreground" />
                          </Select.Icon>
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content
                            position="popper"
                            sideOffset={4}
                            className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
                          >
                            <Select.Viewport>
                              {tvs.map((tv) => (
                                <Select.Item
                                  key={tv.ip}
                                  value={tv.ip}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-accent"
                                >
                                  <span className="flex w-4 shrink-0 justify-center">
                                    <Select.ItemIndicator>
                                      <CheckIcon weight="bold" className="size-3.5" />
                                    </Select.ItemIndicator>
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">
                                    <Select.ItemText>{tv.name || tv.ip}</Select.ItemText>
                                  </span>
                                  {tv.one_slot_mode && <OneSlotInfo />}
                                </Select.Item>
                              ))}
                            </Select.Viewport>
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>

                    {/* Matte */}
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <label htmlFor="image-modal-matte" className="text-xs font-medium text-muted-foreground">
                          Matte
                        </label>
                        {matteIsDefault && <span className="text-[11px] text-muted-foreground">TV default</span>}
                      </div>
                      <select
                        id="image-modal-matte"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/60"
                        value={matteStyle}
                        onChange={(e) => setMatteStyle(e.target.value)}
                      >
                        {MATTE_STYLES.map((style) => (
                          <option key={style} value={style}>
                            {MATTE_STYLE_LABELS[style] ?? style}
                          </option>
                        ))}
                      </select>
                      {matteStyle !== "none" && (
                      <div role="radiogroup" aria-label="Matte color" className="grid grid-cols-8 gap-1.5">
                        {MATTE_COLORS.map((color) => {
                          const selected = color === matteColor;
                          return (
                            <Tooltip key={color} label={MATTE_COLOR_LABELS[color] ?? color}>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                aria-label={MATTE_COLOR_LABELS[color] ?? color}
                                onClick={() => setMatteColor(color)}
                                className={
                                  "aspect-square w-full rounded-full border border-black/15 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 dark:border-white/15 " +
                                  (selected ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "")
                                }
                                style={{ backgroundColor: MATTE_SWATCHES[color] }}
                              />
                            </Tooltip>
                          );
                        })}
                      </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50 border border-border"
                          onClick={handleTvPowerOn}
                          disabled={noTv}
                        >
                          <PowerIcon className="size-4" weight="bold" />
                          Power on
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
                          onClick={handleSendToTV}
                          disabled={noTv}
                        >
                          <ArrowUpTrayIcon className="size-4" weight="bold" />
                          {tvLoading ? "Sending…" : "Upload to TV"}
                        </button>
                      </div>
                      {!isOneSlotMode && (
                        <button
                          type="button"
                          className="mx-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          onClick={handlePlayUploadedImage}
                          disabled={noTv}
                        >
                          <PlayIcon className="size-3.5" weight="fill" />
                          Already on this TV? Show it without re-uploading
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
                    <ExclamationCircleIcon className="size-5 shrink-0 text-warning" />
                    <span>No TVs configured. Add one in Settings to send pictures to it.</span>
                  </div>
                )}

                {error && (
                  <div role="alert" className="rounded-lg border border-destructive/30 bg-danger-surface p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}

                {onDelete && isLocalImage && (
                  <div className="mt-auto border-t border-border/60 pt-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-3 py-2.5 text-sm font-medium text-danger-foreground shadow-xs transition-colors hover:bg-danger-hover disabled:opacity-50"
                      onClick={() => {
                        if (!confirmingDelete) {
                          setConfirmingDelete(true);
                          return;
                        }
                        setConfirmingDelete(false);
                        onDelete();
                      }}
                      disabled={deleteLoading}
                    >
                      <TrashIcon className="size-4" />
                      {deleteLoading ? "Deleting…" : confirmingDelete ? "Press again to delete" : "Delete image"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ImageModal;

import { Dialog } from 'radix-ui'
import { XIcon } from 'lucide-react'

import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { MATTE_STYLES, MATTE_COLORS, splitMatte, combineMatte } from '~/utils/matte'
import type { TVUpdate } from '~/utils/tvApi'

export interface TV {
  ip: string
  name?: string
  mac?: string
  delete_other_images_on_upload?: boolean
  one_slot_mode?: boolean
  slideshow_enabled?: boolean
  slideshow_album_id?: number | null
  slideshow_interval_minutes?: number | null
  default_matte?: string | null
}

interface Props {
  tv: TV | null
  albums: { id: string; name: string }[]
  onClose: () => void
  onUpdate: (ip: string, updates: TVUpdate) => void
  onRemoveAllImages: (ip: string) => void
  onRemove: (ip: string) => void
}

const selectClass =
  'border border-input bg-background px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:opacity-50'

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-sm">
        <div className="font-medium text-foreground">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

export function TvEditModal({ tv, albums, onClose, onUpdate, onRemoveAllImages, onRemove }: Props) {
  const { style: matteStyle, color: matteColor } = splitMatte(tv?.default_matte)

  return (
    <Dialog.Root open={!!tv} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 text-foreground shadow-xl focus:outline-none">
          {tv && (
            <>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-lg font-semibold">{tv.name || tv.ip}</Dialog.Title>
                  <Dialog.Description className="truncate font-mono text-sm text-muted-foreground">
                    {tv.ip}
                    {tv.mac ? ` · ${tv.mac}` : ''}
                  </Dialog.Description>
                </div>
                <Dialog.Close aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground">
                  <XIcon className="h-5 w-5" />
                </Dialog.Close>
              </div>

              <div className="flex flex-col gap-5">
                <section className="flex flex-col gap-4">
                  <ToggleRow
                    label="Delete other images on upload"
                    checked={!!tv.delete_other_images_on_upload}
                    onChange={(v) => onUpdate(tv.ip, { delete_other_images_on_upload: v })}
                  />
                  <ToggleRow
                    label="1-slot mode"
                    hint="Auto-overwrites one managed image. Other TV images are left untouched."
                    checked={!!tv.one_slot_mode}
                    onChange={(v) => onUpdate(tv.ip, { one_slot_mode: v })}
                  />
                </section>

                <section className="flex flex-col gap-3 border-t border-border pt-4">
                  <ToggleRow
                    label="Slideshow"
                    hint="Rotates through an album's images already on this TV, without interrupting what you're watching."
                    checked={!!tv.slideshow_enabled}
                    onChange={(v) => onUpdate(tv.ip, { slideshow_enabled: v })}
                  />
                  <select
                    value={tv.slideshow_album_id ?? ''}
                    onChange={(e) => onUpdate(tv.ip, { slideshow_album_id: e.target.value || null })}
                    aria-label="Slideshow album"
                    className={selectClass}
                  >
                    <option value="">No album</option>
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={tv.slideshow_interval_minutes ?? ''}
                      onChange={(e) => onUpdate(tv.ip, { slideshow_interval_minutes: e.target.value || null })}
                      placeholder="Every … minutes"
                      aria-label="Slideshow interval in minutes"
                    />
                    <span className="whitespace-nowrap text-sm text-muted-foreground">min</span>
                  </div>
                </section>

                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <div className="text-sm font-medium">Default matte</div>
                  <p className="text-xs text-muted-foreground">Used for anything sent to this TV without a matte of its own.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={matteStyle}
                      onChange={(e) => onUpdate(tv.ip, { default_matte: combineMatte(e.target.value, matteColor) })}
                      aria-label="Default matte style"
                      className={selectClass}
                    >
                      {MATTE_STYLES.map((style) => (
                        <option key={style} value={style}>
                          {style === 'none' ? 'No matte' : style}
                        </option>
                      ))}
                    </select>
                    <select
                      value={matteColor}
                      onChange={(e) => onUpdate(tv.ip, { default_matte: combineMatte(matteStyle, e.target.value) })}
                      disabled={matteStyle === 'none'}
                      aria-label="Default matte color"
                      className={selectClass}
                    >
                      {MATTE_COLORS.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>

                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => onRemoveAllImages(tv.ip)}
                    className="text-sm font-medium text-destructive hover:text-destructive/80"
                  >
                    Delete all images from TV
                  </button>
                  <Button
                    type="button"
                    onClick={() => {
                      onRemove(tv.ip)
                      onClose()
                    }}
                    className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove TV
                  </Button>
                </section>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

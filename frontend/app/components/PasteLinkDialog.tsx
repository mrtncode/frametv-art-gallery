import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { resolveLink, type Artwork } from "~/utils/discoverApi";

interface PasteLinkDialogProps {
  open: boolean;
  onClose: () => void;
  /** The artwork the link points at, once found */
  onFound: (artwork: Artwork) => void;
}

/** Paste the address of an artwork page from one of the sources and open that artwork. */
export default function PasteLinkDialog({ open, onClose, onFound }: PasteLinkDialogProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setUrl("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { artwork } = await resolveLink(url.trim());
      onClose();
      onFound(artwork);
    } catch (err: any) {
      setError(err.message || "Could not open that link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg focus:outline-none">
          <Dialog.Title className="mb-1 text-base font-semibold">Paste a link</Dialog.Title>
          <Dialog.Description className="mb-3 text-sm text-muted-foreground">
            Found a picture on one of the sources while browsing its site? Paste the page address to open it here.
          </Dialog.Description>
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <Input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Artwork page address"
              aria-invalid={error ? true : undefined}
              autoFocus
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !url.trim()}>
                {busy ? "Looking…" : "Open"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

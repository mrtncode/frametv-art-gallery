import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import ImageGrid from '../components/imageGrid';
import { Button } from '../components/ui/button';
import { fetchAlbum, deleteAlbum, removeImageFromAlbum } from '../utils/galleryApi';
import { getTvs, sendToTV, type TVInfo } from '../utils/tvApi';

type AlbumImage = { id: number; filename: string };

type AlbumDetail = {
  id: number;
  name: string;
  images: AlbumImage[];
};

export default function AlbumPage() {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [tvs, setTvs] = useState<TVInfo[]>([]);
  const [selectedTvIp, setSelectedTvIp] = useState('');
  const [sendProgress, setSendProgress] = useState('');

  const loadAlbum = async () => {
    if (!albumId) return;
    setLoading(true);
    setError('');
    try {
      const albumData = await fetchAlbum(albumId);
      setAlbum(albumData);
    } catch (e: any) {
      setError(e.message || 'Failed to load album');
      setAlbum(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlbum();
  }, [albumId]);

  useEffect(() => {
    getTvs()
      .then((list: TVInfo[]) => {
        setTvs(list || []);
        if (list?.length) setSelectedTvIp(prev => prev || list[0].ip);
      })
      .catch(() => setTvs([]));
  }, []);

  const selectedTv = tvs.find(tv => tv.ip === selectedTvIp);

  const handleSendAlbumToTv = async () => {
    if (!album || !selectedTvIp || album.images.length === 0) return;
    setBusy(true);
    setError('');
    setSuccessMessage('');

    let sent = 0;
    let consecutiveFailures = 0;
    let lastError = '';

    for (let i = 0; i < album.images.length; i++) {
      const image = album.images[i];
      setSendProgress(`Sending ${i + 1} of ${album.images.length}…`);
      try {
        // Only display the last one, otherwise the TV flips through the whole album.
        await sendToTV({
          payload: { ip: selectedTvIp, filename: image.filename },
          display: i === album.images.length - 1,
        });
        sent++;
        consecutiveFailures = 0;
      } catch (e: any) {
        lastError = e.message || 'Failed to send image';
        consecutiveFailures++;
        // A TV that failed three times in a row is not coming back mid-album.
        if (consecutiveFailures >= 3) {
          setError(`Stopped after ${i + 1} images: ${lastError}`);
          break;
        }
      }
    }

    setSendProgress('');
    setBusy(false);
    if (sent > 0) {
      toast.success(`Sent ${sent} of ${album.images.length} images to the TV`, { position: 'top-center' });
      setSuccessMessage(`Sent ${sent} of ${album.images.length} images to the TV.`);
    } else if (lastError) {
      setError(lastError);
    }
  };

  const handleRemoveFromAlbum = async (imageId: number) => {
    if (!album) return;
    setBusy(true);
    setError('');
    try {
      await removeImageFromAlbum(album.id, imageId);
      await loadAlbum();
    } catch (e: any) {
      setError(e.message || 'Failed to remove image from album');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAlbum = async () => {
    if (!album) return;
    if (!window.confirm(`Delete album "${album.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteAlbum(album.name);
      navigate('/gallery');
    } catch (e: any) {
      setError(e.message || 'Failed to delete album');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => navigate('/gallery')}
        >
          ← Back to Gallery
        </button>
        <button
          type="button"
          className="text-sm text-red-600 hover:text-red-800"
          onClick={handleDeleteAlbum}
          disabled={busy || !album}
        >
          Delete Album
        </button>
      </div>

      {loading ? (
        <div>Loading album…</div>
      ) : !album ? (
        <div className={error ? 'text-red-600' : 'text-muted-foreground'}>{error || 'Album not found.'}</div>
      ) : (
        <>
          <div className="bg-card rounded-lg shadow p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{album.name}</h2>
                <p className="text-sm text-muted-foreground">{album.images.length} image{album.images.length === 1 ? '' : 's'} in this album</p>
              </div>

              <div className="flex flex-col gap-2 md:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTvIp}
                    onChange={e => setSelectedTvIp(e.target.value)}
                    className="border px-2 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    disabled={busy || tvs.length === 0}
                  >
                    {tvs.length === 0 && <option value="">No TV configured</option>}
                    {tvs.map(tv => (
                      <option key={tv.ip} value={tv.ip}>{tv.name || tv.ip}</option>
                    ))}
                  </select>
                  <Button
                    onClick={handleSendAlbumToTv}
                    disabled={busy || !selectedTvIp || album.images.length === 0}
                  >
                    {sendProgress || 'Send album to TV'}
                  </Button>
                </div>
                {selectedTv?.delete_other_images_on_upload && (
                  <p className="text-xs text-amber-600 md:text-right max-w-xs">
                    This TV deletes its other images on every upload, so only the last image of the
                    album would remain. Turn that option off in TV settings first.
                  </p>
                )}
              </div>
            </div>
            {error && <div className="text-red-600 text-sm mt-4">{error}</div>}
            {successMessage && <div className="text-green-700 text-sm mt-2">{successMessage}</div>}
          </div>


          <div className="bg-card rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold mb-4">Album Images</h3>
            {album.images.length === 0 ? (
              <div className="text-muted-foreground">No images in this album yet.</div>
            ) : (
              <ImageGrid
                images={album.images.map(img => ({ id: img.id, filename: img.filename, type: 'local' }))}
                onDeleteImage={(img) => handleRemoveFromAlbum(img.id)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

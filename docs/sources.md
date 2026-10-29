# Discover sources

[← Back to README](../README.md)

The **Discover** tab searches free, high-resolution art and imports it straight into your gallery, framed for a 16:9 Frame TV (3840 × 2160, sRGB JPEG).

Most sources need no key or account. The ones that do take a free key, entered under **Settings → Discover → More sources**.

## Museums and galleries

| Source | License | Notes |
| --- | --- | --- |
| [Reframed Gallery](https://www.reframed.gallery/) | Free for TV use | Curated fine art already cropped to 3840 × 2160, so nothing is processed. Read from the site's public sitemap and pages (it has no API) and cached for a day. Please [tip them](https://ko-fi.com/O5O51FWPUL). |
| [Art Institute of Chicago](https://www.artic.edu/collection) | Public domain (CC0) | The museum's image server crops to 16:9, so only the finished file is downloaded. |
| [The Met](https://www.metmuseum.org/art/collection/search) | Public domain (CC0) | Search can't filter to open-access works, so each page keeps only those. Requests are paced because the Met's firewall blocks bursts. |
| [Cleveland Museum of Art](https://www.clevelandart.org/art/collection/search) | Public domain (CC0) | Print-quality JPEGs up to 3400 px, so filling the screen upscales slightly. |
| [SMK, National Gallery of Denmark](https://open.smk.dk) | Public domain | Danish and European masters, many in full-resolution scans. |
| [The Getty](https://www.getty.edu/art/collection/) | Public domain (CC0) | Paintings, drawings and photographs. Found through the museum's open SPARQL endpoint and downloaded from its image server, scaled to the TV. |
| [National Gallery of Art](https://www.nga.gov/open-access-images.html) | Public domain | Through Wikimedia Commons, where the museum donated its open-access paintings. It has no search API of its own. |
| [Yale Center for British Art](https://britishart.yale.edu/) | Public domain | Through Wikimedia Commons, for the same reason. |
| [Museum of Modern Art](https://commons.wikimedia.org/wiki/Category:Paintings_in_the_Museum_of_Modern_Art) | Public domain | Through Wikimedia Commons. MoMA's own API is for staff and partners, and most of its collection is still under copyright, so this covers its older paintings only. |
| [The Louvre](https://commons.wikimedia.org/wiki/Category:Paintings_in_the_Louvre) | Public domain | Louvre paintings in high-resolution scans, through Wikimedia Commons. |
| [Museums of the world](https://commons.wikimedia.org/wiki/Category:Google_Art_Project_works_by_artist) | Public domain | Google Art Project scans from hundreds of museums, through Wikimedia Commons. |
| [Smithsonian American Art Museum](https://americanart.si.edu/art) | Public domain (CC0) | Full resolution. **Needs a free [api.data.gov key](https://api.data.gov/signup/).** |
| [Cooper Hewitt Design Museum](https://collection.cooperhewitt.org/) | Public domain (CC0) | Design and posters. Shares the Smithsonian key. |

## Prints, posters and illustration

| Source | License | Notes |
| --- | --- | --- |
| [Japanese woodblock prints](https://commons.wikimedia.org/wiki/Category:Ukiyo-e) | Public domain | Ukiyo-e: waves, mountains, cats and kabuki. |
| [Holiday postcards](https://commons.wikimedia.org/) | Public domain | Vintage Halloween, Christmas, Easter and other postcards. With nothing typed it shows whatever is in season. Mostly upright, so it starts without the Wide filter. |
| [Vintage posters](https://commons.wikimedia.org/) | Public domain | Travel posters, advertising and Art Nouveau prints. |
| [Digital art](https://commons.wikimedia.org/wiki/Category:Digital_art), [Pop art](https://commons.wikimedia.org/wiki/Category:Pop_art), [Illustration & cartoons](https://commons.wikimedia.org/wiki/Category:Illustrations) | CC0, CC BY, CC BY-SA or public domain | Modern work shared by the artists. The artist and license are saved with each import. Non-commercial and no-derivatives licenses are never offered. |
| [Pixabay illustrations](https://pixabay.com/illustrations/) | Pixabay Content License | **Needs a free [key](https://pixabay.com/api/docs/).** A standard key returns files up to 1280 px; Pixabay can approve a key for full-size files. |

## Photography and space

| Source | License | Notes |
| --- | --- | --- |
| [NASA Image Library](https://images.nasa.gov/) | NASA, free to use | Nebulae, planets and Earth from orbit. Originals only, and anything under 1600 px wide is left out. |
| [Flickr](https://www.flickr.com/creativecommons/) | CC0, CC BY, CC BY-SA, public domain | Freely licensed photography and street art, searched by tag or title. **Needs a free [key](https://www.flickr.com/services/apps/create/apply/).** |

## Unverified license (personal use, off by default)

These are large, well-tagged libraries, but they don't record a reusable license for each picture. They are flagged in the app, **off by default**, and never appear in the daily highlights. Turn them on under **Settings → Discover → More sources**. Only pictures at least 1920 px wide are offered.

| Source | Notes |
| --- | --- |
| [Wallhaven](https://wallhaven.cc/) | Digital art and wallpapers. No key. |
| [DeviantArt](https://www.deviantart.com/) | Only art the artist made downloadable. **Needs a free [app](https://www.deviantart.com/developers/apps)** (client ID and secret). |
| [Danbooru](https://danbooru.donmai.us/) and [Konachan](https://konachan.net/) | Anime and illustration, searched by tag. General/safe ratings only. No key. |
| [Bing daily wallpapers](https://www.bing.com/) | Each day's world photograph in 4K. No key. |
| [Mastodon art tags](https://mastodon.social/tags/mastoart) | What artists are posting now, by hashtag (`mastoart`, `pixelart`, `digitalart`). Reads one server's public tag pages; sensitive posts are skipped. No key. |

## Framing and filters

- **Fill the screen** crops to 16:9. Each tile previews exactly what you'll get and shows how much is cropped.
- **Whole artwork** keeps every edge and lets the TV add a matte.
- **Shape** narrows results to *Landscape* (wider than tall), *Wide* (close to 16:9, the default) or *No matte needed* (within 3% of 16:9, so nothing is cropped or padded).
- **Albums**: pick an album before importing, or create one on the spot.
- **Paste a link** to an artwork page on a supported site to import that exact piece.
- **Reorder sources** by dragging them in the Discover source picker.

## Keys

Keys are stored on your server, are never shown again after saving, and the source appears in Discover as soon as its key is saved. See [SECURITY.md](../SECURITY.md#discover-source-keys) for how they're kept.

## Being a good guest

These collections are free because their institutions choose to share them. While an artwork downloads, the progress window links to the source's support page.

Set `DISCOVER_CONTACT` to an email or URL so the Art Institute of Chicago knows who is making requests, as its API documentation asks. See [Configuration](configuration.md).

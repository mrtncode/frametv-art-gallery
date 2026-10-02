"""Covers each Discover source: what it asks the museum, and how it reads the answer.

Run with: pytest tests/test_discover_sources.py
"""

import pytest
from discover_fakes import FakeNet, FakeResponse

from utils.discover import SOURCES, resolve_url
from utils.discover.artic import artic
from utils.discover.cleveland import cleveland
from utils.discover.common import (
    SHAPES,
    DiscoverError,
    DiskCache,
    apply_shape,
    artwork,
    prune_old_files,
)
from utils.discover.met import met
from utils.discover.reframed import reframed
from utils.discover.smk import smk
import datetime

from utils.discover.nasa import nasa
from utils.discover.seasons import easter, seasonal_word, thanksgiving
from utils.discover.wikimedia import holidays, louvre, posters, world_museums


@pytest.fixture
def net(monkeypatch, tmp_path):
    # A private cache directory per test, so nothing is remembered from another one.
    monkeypatch.setattr(DiskCache, "directory", str(tmp_path / "cache"))
    return FakeNet().install(monkeypatch)


# --- Art Institute of Chicago ----------------------------------------------------


def aic_record(record_id, title, width, height, public=True, image=True):
    return {
        "id": record_id,
        "title": title,
        "artist_title": "Claude Monet",
        "date_display": "1891",
        "image_id": f"img-{record_id}" if image else None,
        "thumbnail": {"width": width, "height": height},
        "is_public_domain": public,
    }


def test_aic_search_asks_for_public_domain_paintings_and_matches_the_text(net):
    net.add("artworks/search", FakeResponse({
        "pagination": {"total": 3, "total_pages": 2},
        "data": [
            aic_record(1, "Wide", 4000, 2250),
            aic_record(2, "Square", 3000, 3000),
            aic_record(3, "Rights held", 4000, 2250, public=False),
            aic_record(4, "No image", 4000, 2250, image=False),
        ],
    }))

    page = artic.search("monet", 1, paintings_only=True, shape="wide")

    body = net.calls[0]["json"]
    must = body["query"]["bool"]["must"]
    # The text has to be inside the query: the API ignores a top-level `q` once `query` is set.
    assert any("multi_match" in clause and clause["multi_match"]["query"] == "monet" for clause in must)
    assert {"term": {"is_public_domain": True}} in must
    assert {"term": {"artwork_type_title.keyword": "Painting"}} in must
    assert "q" not in body
    assert "AIC-User-Agent" in net.calls[0]["headers"]

    assert [item["title"] for item in page["results"]] == ["Wide"]
    assert page["hidden"] == 1  # the square one
    assert page["has_more"] is True and page["total"] == 3
    item = page["results"][0]
    assert item["thumb_url"] == "https://www.artic.edu/iiif/2/img-1/full/400,/0/default.jpg"
    assert item["page_url"] == "https://www.artic.edu/artworks/1"
    assert item["crop_loss"] == pytest.approx(0, abs=0.001)


def test_aic_can_include_everything_not_only_paintings(net):
    net.add("artworks/search", FakeResponse({"pagination": {"total": 0, "total_pages": 0}, "data": []}))

    artic.search("", 1, paintings_only=False, shape="any")

    must = net.calls[0]["json"]["query"]["bool"]["must"]
    assert not any("artwork_type_title.keyword" in str(clause) for clause in must)
    # An empty search still needs something to match, so it falls back to the default.
    assert must[0]["multi_match"]["query"] == artic.default_query


def test_aic_plan_asks_the_museum_to_crop(net):
    net.add("artworks/64818", FakeResponse({"data": aic_record(64818, "Stacks of Wheat", 5898, 4176)}))

    plan = artic.plan("64818", "fill")

    assert plan.url == "https://www.artic.edu/iiif/2/img-64818/0,429,5898,3317/3840,2160/0/default.jpg"
    assert plan.server_cropped and "AIC-User-Agent" in plan.headers


def test_aic_refuses_works_that_are_not_public_domain(net):
    net.add("artworks/9", FakeResponse({"data": aic_record(9, "Rights held", 4000, 2250, public=False)}))

    with pytest.raises(DiscoverError):
        artic.plan("9", "fill")


# --- Cleveland ---------------------------------------------------------------------


def cleveland_record(record_id, license_status="CC0", width="3400", height="1900", has_print=True):
    return {
        "id": record_id,
        "title": f"Work {record_id}",
        "creators": [{"description": "Pierre-Auguste Renoir (French, 1841-1919)"}],
        "creation_date": "1880",
        "share_license_status": license_status,
        "url": f"https://www.clevelandart.org/art/{record_id}",
        "images": {
            "web": {"url": "https://cdn.test/web.jpg", "width": "900", "height": "500"},
            "print": {"url": "https://cdn.test/print.jpg", "width": width, "height": height} if has_print else None,
        },
    }


def test_cleveland_search_only_asks_for_cc0_with_images(net):
    net.add("openaccess-api", FakeResponse({
        "info": {"total": 60},
        "data": [cleveland_record(1), cleveland_record(2, license_status="Copyrighted"),
                 cleveland_record(3, has_print=False), cleveland_record(4, width="1500", height="2000")],
    }))

    page = cleveland.search("renoir", 2, paintings_only=True, shape="wide")

    params = net.calls[0]["params"]
    assert params["cc0"] == 1 and params["has_image"] == 1 and params["type"] == "Painting"
    assert params["skip"] == 24 and params["q"] == "renoir"
    assert [item["id"] for item in page["results"]] == ["1"]
    assert page["hidden"] == 1  # the portrait
    assert page["results"][0]["artist"] == "Pierre-Auguste Renoir"  # the bracket is dropped
    assert page["results"][0]["width"] == 3400 and page["has_more"] is True


def test_cleveland_looks_up_an_accession_number_from_a_page_link(net):
    net.add("openaccess-api", lambda url, params, *_: FakeResponse(
        {"data": [cleveland_record(136510)]} if params.get("accession_number") == "1958.39" else {"data": []}
    ))

    assert cleveland.from_url("https://www.clevelandart.org/art/1958.39") == "1958.39"
    assert cleveland.get("1958.39")["id"] == "136510"


# --- The Met -----------------------------------------------------------------------


def met_object(object_id, public=True, image=True, height=50.0, width=100.0):
    return {
        "objectID": object_id,
        "title": f"Object {object_id}",
        "artistDisplayName": "Vincent van Gogh",
        "objectDate": "1889",
        "isPublicDomain": public,
        "primaryImage": f"https://images.metmuseum.org/{object_id}.jpg" if image else "",
        "primaryImageSmall": f"https://images.metmuseum.org/{object_id}-small.jpg" if image else "",
        "objectURL": f"https://www.metmuseum.org/art/collection/search/{object_id}",
        "measurements": [{"elementName": "Overall", "elementMeasurements": {"Height": height, "Width": width}}],
    }


def met_routes(net, objects, ids=None, total=None):
    net.add("v1.1/search", FakeResponse({"total": total or len(ids or objects), "objectIDs": ids or list(objects)}))

    def obj(url, *_):
        object_id = int(url.rsplit("/", 1)[1])
        if object_id not in objects:
            return FakeResponse(status=404)
        return FakeResponse(objects[object_id])

    net.add("v1/objects/", obj)


def test_met_keeps_only_open_access_works_because_search_cannot_filter(net):
    met_routes(net, {
        1: met_object(1),
        2: met_object(2, public=False),
        3: met_object(3, image=False),
        4: met_object(4, height=90, width=60),   # a portrait
    }, ids=[1, 2, 3, 4, 5], total=500)  # 5 does not exist: skipped, not fatal

    page = met.search("van gogh", 1, paintings_only=True, shape="wide")

    assert [item["id"] for item in page["results"]] == ["1"]
    assert page["hidden"] == 1
    assert page["total"] is None  # the raw total counts works we cannot use
    assert page["has_more"] is True
    assert net.calls[0]["params"]["medium"] == "Paintings"
    assert page["results"][0]["aspect"] == 2.0  # from the physical size, as images are not measured


def test_met_reuses_cached_objects(net):
    met_routes(net, {1: met_object(1)})

    met.search("sunflowers", 1, paintings_only=False, shape="any")
    met.search("sunflowers", 1, paintings_only=False, shape="any")

    object_calls = [call for call in net.calls if "v1/objects/" in call["url"]]
    assert len(object_calls) == 1  # the second search came from the cache


def test_met_blocking_us_is_reported_not_swallowed(net):
    net.add("v1.1/search", FakeResponse({"total": 1, "objectIDs": [1]}))
    net.add("v1/objects/", FakeResponse(status=403))

    with pytest.raises(DiscoverError) as raised:
        met.search("monet", 1, paintings_only=True, shape="wide")

    assert raised.value.status == 429 and "limiting requests" in str(raised.value)


def test_met_plan_uses_the_original_image(net):
    met_routes(net, {7: met_object(7)})

    plan = met.plan("7", "fill")

    assert plan.url == "https://images.metmuseum.org/7.jpg"
    assert plan.artist == "Vincent van Gogh"


# --- Reframed ----------------------------------------------------------------------

SITEMAP = """<urlset>
<url><loc>https://www.reframed.gallery</loc></url>
<url><loc>https://www.reframed.gallery/recent</loc></url>
<url><loc>https://www.reframed.gallery/claude-monet</loc></url>
<url><loc>https://www.reframed.gallery/claude-monet/impression-sunrise</loc></url>
<url><loc>https://www.reframed.gallery/claude-monet/wheatstacks</loc></url>
<url><loc>https://www.reframed.gallery/vincent-van-gogh/starry-night</loc></url>
<url><loc>https://www.reframed.gallery/collections/new-world</loc></url>
</urlset>"""


def reframed_record(artist, title, slug_artist, slug_title, orientation="landscape"):
    # Mirrors how the site embeds its data: JSON inside a JS string, quotes escaped.
    return (
        '{\\"id\\":\\"123e4567-e89b-12d3-a456-426614174000\\",'
        f'\\"r2Key\\":\\"originals/{artist} - {title} - reframed.jpg\\",\\"cfImageId\\":\\"x\\",'
        f'\\"alt\\":\\"{title}\\",\\"href\\":\\"/{slug_artist}/{slug_title}\\",\\"orientation\\":\\"{orientation}\\"}}'
    )


def listing_page(*records):
    return FakeResponse(text="<script>self.__next_f.push([1,\"" + ",".join(records) + "\"])</script>")


def reframed_routes(net):
    net.add("sitemap.xml", FakeResponse(text=SITEMAP))
    net.add("/claude-monet", listing_page(
        reframed_record("Claude Monet", "Impression, Sunrise", "claude-monet", "impression-sunrise"),
        reframed_record("Claude Monet", "Wheatstacks", "claude-monet", "wheatstacks"),
        reframed_record("Claude Monet", "Portrait Study", "claude-monet", "portrait-study", orientation="portrait"),
    ))
    net.add("/vincent-van-gogh", listing_page(
        reframed_record("Vincent van Gogh", "Starry Night", "vincent-van-gogh", "starry-night"),
    ))
    net.add("/recent", listing_page(
        reframed_record("Vincent van Gogh", "Starry Night", "vincent-van-gogh", "starry-night"),
    ))


def test_reframed_searches_the_sitemap_and_reads_thumbnails_from_artist_pages(net):
    reframed_routes(net)

    page = reframed.search("monet", 1, paintings_only=True, shape="wide")

    assert [item["title"] for item in page["results"]] == ["Impression, Sunrise", "Wheatstacks"]
    first = page["results"][0]
    assert first["id"] == "claude-monet/impression-sunrise"
    assert first["artist"] == "Claude Monet" and first["tv_ready"] is True
    assert first["thumb_url"].startswith("https://cdn.reframed.gallery/cdn-cgi/image/width=480")
    assert "Claude%20Monet%20-%20Impression%2C%20Sunrise%20-%20reframed.jpg" in first["thumb_url"]
    assert page["total"] == 2 and page["has_more"] is False
    # Collections and the home page are not artworks.
    assert not any("collections" in item["id"] for item in reframed.search("new world", 1, True, "wide")["results"])


def test_reframed_with_no_search_shows_what_is_new(net):
    reframed_routes(net)

    page = reframed.search("", 1, paintings_only=True, shape="wide")

    assert [item["title"] for item in page["results"]] == ["Starry Night"]


def test_reframed_hides_portrait_works_unless_asked(net):
    net.add("sitemap.xml", FakeResponse(text=SITEMAP.replace("wheatstacks", "portrait-study")))
    reframed_routes(net)

    wide = reframed.search("portrait", 1, paintings_only=True, shape="wide")
    everything = reframed.search("portrait", 1, paintings_only=True, shape="any")

    assert wide["results"] == [] and wide["hidden"] == 1
    assert [item["title"] for item in everything["results"]] == ["Portrait Study"]


def test_reframed_plan_points_at_the_original_file(net):
    reframed_routes(net)

    plan = reframed.plan("claude-monet/wheatstacks", "fill")

    assert plan.url == "https://cdn.reframed.gallery/originals/Claude%20Monet%20-%20Wheatstacks%20-%20reframed.jpg"
    assert plan.page_url == "https://www.reframed.gallery/claude-monet/wheatstacks"


def test_reframed_notices_when_its_layout_changes(net):
    net.add("sitemap.xml", FakeResponse(text=SITEMAP))
    net.add("/claude-monet", FakeResponse(text="<html>a redesigned page</html>"))
    net.add("impression-sunrise", FakeResponse(text="<html>a redesigned page</html>"))

    with pytest.raises(DiscoverError):
        reframed.plan("claude-monet/impression-sunrise", "fill")


# --- Pasted page links -------------------------------------------------------------


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://www.reframed.gallery/claude-monet/impression-sunrise", ("reframed", "claude-monet/impression-sunrise")),
        ("https://reframed.gallery/claude-monet/impression-sunrise?ref=x", ("reframed", "claude-monet/impression-sunrise")),
        ("https://www.artic.edu/artworks/64818/stacks-of-wheat-end-of-summer", ("artic", "64818")),
        ("https://www.metmuseum.org/art/collection/search/436535", ("met", "436535")),
        ("https://www.clevelandart.org/art/1958.39", ("cleveland", "1958.39")),
    ],
)
def test_page_links_resolve_to_a_source_and_id(url, expected):
    assert resolve_url(url) == expected


@pytest.mark.parametrize(
    "url",
    [
        "https://www.reframed.gallery/collections/new-world",
        "https://www.reframed.gallery/artists",
        "https://example.com/art/1",
        "https://evil.test/https://www.metmuseum.org/art/collection/search/1",
        "javascript:alert(1)",
        "ftp://www.metmuseum.org/art/collection/search/1",
        "",
        None,
    ],
)
def test_links_that_are_not_supported_artwork_pages_are_refused(url):
    with pytest.raises(DiscoverError):
        resolve_url(url)


def test_every_source_describes_where_to_send_thanks():
    for source in SOURCES.values():
        assert source.support_url.startswith("https://")
        assert source.support_label and source.icon_url.startswith("https://")


def test_stale_cache_files_are_pruned_and_fresh_ones_kept(tmp_path):
    import os
    import time

    old, fresh = tmp_path / "old.json", tmp_path / "sub" / "fresh.json"
    fresh.parent.mkdir()
    old.write_text("{}")
    fresh.write_text("{}")
    long_ago = time.time() - 30 * 24 * 3600
    os.utime(old, (long_ago, long_ago))

    prune_old_files(str(tmp_path), 14 * 24 * 3600)

    assert not old.exists() and fresh.exists()


# --- Shape filters -----------------------------------------------------------------


def shaped(aspect):
    return artwork("t", str(aspect), "Work", "Artist", "", "https://t/x.jpg", "https://t/p", "CC0", aspect=aspect)


ALL_SHAPES = [1.778, 1.75, 1.85, 1.6, 1.3, 1.0, 0.6, None]


@pytest.mark.parametrize(
    "shape, kept",
    [
        ("any", ALL_SHAPES),
        # Clearly wider than tall; a work of unknown shape gets the benefit of the doubt.
        ("landscape", [1.778, 1.75, 1.85, 1.6, 1.3, None]),
        ("wide", [1.778, 1.75, 1.85, 1.6, None]),
        # No matte needed: within 3% of 16:9, and only if the shape is actually known.
        ("fits", [1.778, 1.75]),
    ],
)
def test_shape_filters_keep_what_they_promise(shape, kept):
    items, hidden = apply_shape([shaped(a) for a in ALL_SHAPES], shape)

    assert [item["aspect"] for item in items] == kept
    assert hidden == len(ALL_SHAPES) - len(kept)


def test_the_fits_filter_agrees_with_the_badge_on_the_tile():
    # 1.85 loses 3.9% to a crop, so the tile says "Crops 4%", not "Fits 16:9".
    assert shaped(1.85)["crop_loss"] > 0.03
    assert shaped(1.75)["crop_loss"] <= 0.03


def test_there_are_exactly_four_shapes():
    assert SHAPES == ("any", "landscape", "wide", "fits")


def test_a_source_applies_the_shape_it_is_given(net):
    net.add("openaccess-api", FakeResponse({
        "info": {"total": 3},
        "data": [cleveland_record(1, width="3840", height="2160"),   # 16:9
                 cleveland_record(2, width="3400", height="2400"),   # 1.42, landscape but not wide
                 cleveland_record(3, width="1500", height="2000")],  # portrait
    }))

    def ids(shape):
        return [item["id"] for item in cleveland.search("x", 1, True, shape)["results"]]

    assert ids("any") == ["1", "2", "3"]
    assert ids("landscape") == ["1", "2"]
    assert ids("wide") == ["1"]
    assert ids("fits") == ["1"]


# --- SMK (Denmark) -----------------------------------------------------------------


def smk_record(number, title="Evening Landscape", width=5760, height=3840, public=True, image=True):
    return {
        "object_number": number,
        "titles": [{"title": "Aftenlandskab", "language": "dansk"}, {"title": title, "language": "engelsk"}],
        "artist": ["Julius Paulsen", "Someone Else"],
        "production_date": [{"period": "1886"}],
        "image_width": width,
        "image_height": height,
        "image_native": f"https://api.smk.dk/api/v1/download/{number}.jpg" if image else None,
        "image_thumbnail": f"https://api.smk.dk/api/v1/thumbnail/{number}.jpg",
        "frontend_url": f"https://open.smk.dk/artwork/image/{number}",
        "public_domain": public,
        "has_image": image,
    }


def test_smk_searches_public_domain_paintings_with_images(net):
    net.add("api.smk.dk/api/v1/art/search", FakeResponse({
        "found": 100,
        "items": [smk_record("KMS1"), smk_record("KMS2", public=False), smk_record("KMS3", image=False),
                  smk_record("KMS4", width=1000, height=1500)],
    }))

    page = smk.search("landscape", 2, paintings_only=True, shape="landscape")

    params = net.calls[0]["params"]
    assert params["keys"] == "landscape" and params["offset"] == 24 and params["lang"] == "en"
    assert params["filters"] == "[has_image:true],[public_domain:true],[object_names:painting]"
    assert [item["id"] for item in page["results"]] == ["KMS1"]
    assert page["hidden"] == 1 and page["total"] == 100 and page["has_more"] is True
    item = page["results"][0]
    assert item["title"] == "Evening Landscape"          # the English title, not the Danish one
    assert item["artist"] == "Julius Paulsen, Someone Else"
    assert (item["width"], item["height"], item["date"]) == (5760, 3840, "1886")
    assert item["thumb_url"].endswith("/thumbnail/KMS1.jpg")


def test_smk_plan_uses_the_native_image_and_knows_its_size(net):
    net.add("api.smk.dk/api/v1/art/", FakeResponse({"items": [smk_record("KMS9")]}))

    plan = smk.plan("KMS9", "fill")

    assert plan.url == "https://api.smk.dk/api/v1/download/KMS9.jpg"
    assert (plan.width, plan.height) == (5760, 3840)
    assert smk.from_url("https://open.smk.dk/artwork/image/KMS9") == "KMS9"
    assert smk.from_url("https://example.com/artwork/image/KMS9") is None


# --- Wikimedia Commons (the Louvre and world museums) -------------------------------


def commons_page(page_id, file_title, license_name="Public domain", width=4000, height=3000, mime="image/jpeg",
                 object_name=None, artist="Some Photographer", thumb=True):
    meta = {"LicenseShortName": {"value": license_name}, "Artist": {"value": f'<a href="x">{artist}</a>'}}
    if object_name:
        meta["ObjectName"] = {"value": object_name}
    info = {
        "width": width, "height": height, "mime": mime, "extmetadata": meta,
        "url": f"https://upload.wikimedia.org/original/{page_id}.jpg",
        "descriptionurl": f"https://commons.wikimedia.org/wiki/{file_title}",
    }
    if thumb:
        info["thumburl"] = f"https://upload.wikimedia.org/thumb/{page_id}.jpg"
    return {"pageid": page_id, "title": file_title, "index": page_id, "imageinfo": [info]}


def test_commons_only_offers_public_domain_images_of_a_usable_size_and_type(net):
    pages = {
        "1": commons_page(1, "File:Claude Monet - The Magpie - Google Art Project.jpg"),
        "2": commons_page(2, "File:Photo of a painting.jpg", license_name="CC BY-SA 4.0"),
        "3": commons_page(3, "File:Mona Lisa.jpg", license_name="CC0"),
        "4": commons_page(4, "File:Scan.tif", mime="image/tiff"),
        "5": commons_page(5, "File:Gigantic.jpg", width=30000, height=40000),
    }
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}, "continue": {"gsroffset": 24}}))

    page = world_museums.search("monet", 1, paintings_only=True, shape="any")

    assert [item["id"] for item in page["results"]] == ["1", "3"]
    assert page["has_more"] is True and page["total"] is None
    first = page["results"][0]
    assert (first["title"], first["artist"], first["license"]) == ("The Magpie", "Claude Monet", "Public domain")
    assert first["page_url"].startswith("https://commons.wikimedia.org/wiki/File:")


def test_commons_search_is_limited_to_the_collection_and_cannot_be_hijacked(net):
    net.add("w/api.php", FakeResponse({"query": {"pages": {}}}))

    louvre.search('monet" OR deepcategory:"Secrets (x)', 2, True, "any")

    params = net.calls[0]["params"]
    assert params["generator"] == "search" and params["gsroffset"] == 24 and params["gsrnamespace"] == 6
    search = params["gsrsearch"]
    assert search.startswith('deepcategory:"Paintings in the Louvre" ')
    assert "filew:>2500" in search and "filetype:bitmap" in search
    # Operators the visitor typed are neutralised, so they cannot widen the search.
    assert search.count("deepcategory:") == 1 and "OR" in search and '"Secrets' not in search


def test_commons_trusts_the_filename_over_a_photographers_name(net):
    pages = {
        "1": commons_page(1, "File:Antonello da Messina - Christ at the Column.jpg", artist="Wilfredor"),
        "2": commons_page(2, "File:(Agen) Portrait de Joseph - Musée du Louvre.jpg", artist="Didier Descouens"),
    }
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    results = louvre.search("x", 1, True, "any")["results"]

    assert results[0]["artist"] == "Antonello da Messina" and results[0]["title"] == "Christ at the Column"
    # Nothing in the name says who painted it, and the metadata names the photographer.
    assert results[1]["artist"] == "Unknown artist"


def test_commons_ignores_markup_left_in_the_title_field(net):
    pages = {"1": commons_page(1, "File:Claude Monet - Nympheas - Google Art Project.jpg",
                               object_name='label QS:Lja,"x"')}
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    assert world_museums.search("x", 1, True, "any")["results"][0]["title"] == "Nympheas"


def test_commons_asks_for_a_copy_scaled_to_the_panel_not_the_original(net):
    net.add("w/api.php", lambda url, params, *_: FakeResponse({"query": {"pages": {"7": commons_page(
        7, "File:Claude Monet - Big.jpg", width=8000, height=6000)}}}))

    plan = world_museums.plan("7", "fill")

    assert net.calls[0]["params"]["iiurlwidth"] == 3840 and net.calls[0]["params"]["pageids"] == "7"
    assert plan.url.startswith("https://upload.wikimedia.org/thumb/")
    assert (plan.width, plan.height) == (3840, 2880)


def test_commons_keeps_a_small_original_as_it_is(net):
    net.add("w/api.php", FakeResponse({"query": {"pages": {"8": commons_page(8, "File:A - B.jpg", width=3000, height=2000)}}}))

    plan = world_museums.plan("8", "fill")

    assert plan.url.endswith("/original/8.jpg") and (plan.width, plan.height) == (3000, 2000)


def test_a_commons_file_link_goes_to_the_world_collection_only():
    link = "https://commons.wikimedia.org/wiki/File:Claude_Monet_-_The_Magpie_-_Google_Art_Project.jpg"

    assert resolve_url(link) == ("worldmuseums", "File:Claude_Monet_-_The_Magpie_-_Google_Art_Project.jpg")
    assert louvre.from_url(link) is None
    with pytest.raises(DiscoverError):
        resolve_url("https://commons.wikimedia.org/wiki/Category:Paintings")


def test_smk_asks_for_a_tile_sized_preview_not_the_1024px_one(net):
    record = smk_record("KMS7")
    record["image_thumbnail"] = "https://iip-thumb.smk.dk/iiif/jp2/x.tif.jp2/full/!1024,/0/default.jpg"
    net.add("api.smk.dk/api/v1/art/search", FakeResponse({"found": 1, "items": [record]}))

    item = smk.search("x", 1, False, "any")["results"][0]

    assert item["thumb_url"].endswith("/full/!480,/0/default.jpg")


def test_commons_dates_lose_the_markup_that_follows_them(net):
    page = commons_page(1, "File:Claude Monet - Springtime - Google Art Project.jpg")
    page["imageinfo"][0]["extmetadata"]["DateTimeOriginal"] = {"value": '1872 date QS:P571,+1872-00-00T00:00:00Z/9'}
    net.add("w/api.php", FakeResponse({"query": {"pages": {"1": page}}}))

    assert world_museums.search("x", 1, True, "any")["results"][0]["date"] == "1872"


def test_a_keyword_collection_searches_commons_for_its_keyword_without_a_category(net):
    net.add("w/api.php", FakeResponse({"query": {"pages": {}}}))

    holidays.search('witch" OR deepcategory:"x', 1, True, "any")
    posters.search("", 1, True, "any")

    witch, travel = (call["params"]["gsrsearch"] for call in net.calls)
    assert "deepcategory:" not in witch and witch.endswith(" postcard filew:>1500 filetype:bitmap")
    assert witch.startswith("witch") and '"' not in witch
    # With nothing typed, a poster collection shows travel posters.
    assert travel.startswith("travel poster ") and "filew:>2000" in travel


def test_commons_also_accepts_files_marked_as_having_no_restrictions(net):
    pages = {
        "1": commons_page(1, "File:Halloween card.jpg", license_name="No restrictions"),
        "2": commons_page(2, "File:Halloween photo.jpg", license_name="CC BY 2.0"),
    }
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    assert [item["id"] for item in holidays.search("halloween", 1, True, "any")["results"]] == ["1"]


def test_easter_and_thanksgiving_are_worked_out_for_each_year():
    assert [easter(y) for y in (2025, 2026, 2027, 2038)] == [
        datetime.date(2025, 4, 20), datetime.date(2026, 4, 5), datetime.date(2027, 3, 28), datetime.date(2038, 4, 25)
    ]
    assert [thanksgiving(y) for y in (2025, 2026, 2027)] == [
        datetime.date(2025, 11, 27), datetime.date(2026, 11, 26), datetime.date(2027, 11, 25)
    ]


def test_the_season_follows_the_calendar_including_moving_holidays():
    day = datetime.date
    expected = {
        day(2026, 1, 3): "christmas", day(2026, 1, 10): "winter", day(2026, 2, 1): "valentine",
        day(2026, 2, 20): "winter", day(2026, 3, 8): "easter", day(2026, 3, 7): "spring",
        day(2026, 4, 5): "easter", day(2026, 4, 6): "spring", day(2026, 6, 1): "summer",
        day(2026, 9, 15): "autumn", day(2026, 10, 2): "halloween", day(2026, 10, 31): "halloween",
        day(2026, 11, 1): "thanksgiving", day(2026, 11, 26): "thanksgiving", day(2026, 11, 27): "christmas",
        day(2026, 12, 25): "christmas",
        # Easter moves: late in 2038, early in 2027.
        day(2038, 4, 20): "easter", day(2027, 3, 1): "easter", day(2027, 2, 20): "winter", day(2027, 3, 10): "easter",
    }
    for date, word in expected.items():
        assert seasonal_word(date) == word, date


def test_the_holiday_collection_suggests_what_is_in_season():
    assert holidays.default_query == seasonal_word()
    assert posters.default_query == "travel"


def nasa_record(nasa_id="PIA1", width=4000, height=2500, size=900_000, title="Pillars"):
    base = f"http://images-assets.nasa.gov/image/{nasa_id}/{nasa_id}"
    return {
        "data": [{"nasa_id": nasa_id, "title": title, "secondary_creator": "NASA/ESA", "date_created": "2015-04-10T00:00:00Z"}],
        "links": [
            {"href": base + "~thumb.jpg", "rel": "preview", "width": 640, "height": 400},
            {"href": base + "~orig.jpg", "rel": "canonical", "width": width, "height": height, "size": size},
        ],
    }


def test_nasa_offers_only_images_big_enough_for_a_tv_and_small_enough_to_download(net):
    records = [
        nasa_record("PIA1"),
        nasa_record("PIA2", width=800, height=600),
        nasa_record("PIA3", size=500 * 1024 * 1024),
        {"data": [{"nasa_id": "PIA4"}], "links": []},
    ]
    net.add("images-api.nasa.gov/search", FakeResponse({"collection": {
        "items": records,
        "metadata": {"total_hits": 805},
        "links": [{"rel": "next", "href": "http://images-api.nasa.gov/search?page=2"}],
    }}))

    page = nasa.search("nebula", 2, paintings_only=True, shape="any")

    assert [item["id"] for item in page["results"]] == ["PIA1"]
    assert page["has_more"] is True and page["total"] == 805
    params = net.calls[0]["params"]
    assert params["q"] == "nebula" and params["media_type"] == "image" and params["page"] == 2
    item = page["results"][0]
    assert item["thumb_url"] == "https://images-assets.nasa.gov/image/PIA1/PIA1~thumb.jpg"
    assert (item["title"], item["artist"], item["date"]) == ("Pillars", "NASA/ESA", "2015")
    assert (item["width"], item["height"]) == (4000, 2500)
    assert item["page_url"] == "https://images.nasa.gov/details/PIA1"


def test_nasa_downloads_the_original_and_reads_its_own_links():
    assert nasa.from_url("https://images.nasa.gov/details/PIA14417") == "PIA14417"
    assert nasa.from_url("https://images.nasa.gov/search?q=x") is None
    assert nasa.from_url("https://example.com/details/PIA14417") is None


def test_nasa_plan_uses_the_original_file_over_https(net):
    net.add("images-api.nasa.gov/search", FakeResponse({"collection": {"items": [nasa_record("PIA9")]}}))

    plan = nasa.plan("PIA9", "fill")

    assert net.calls[0]["params"]["nasa_id"] == "PIA9"
    assert plan.url == "https://images-assets.nasa.gov/image/PIA9/PIA9~orig.jpg"
    assert (plan.width, plan.height) == (4000, 2500)


def test_nasa_reports_a_missing_image(net):
    net.add("images-api.nasa.gov/search", FakeResponse({"collection": {"items": []}}))

    with pytest.raises(DiscoverError):
        nasa.get("nope")


def test_commons_drops_placeholder_artists_and_names_printed_twice(net):
    pages = {
        "1": commons_page(1, "File:Halloween card.jpg", artist="Unknown author Unknown author"),
        "2": commons_page(2, "File:Pumpkin card.jpg", artist="Ellen Clapsaddle Ellen Clapsaddle"),
    }
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    artists = [item["artist"] for item in holidays.search("halloween", 1, True, "any")["results"]]

    assert artists == ["Unknown artist", "Ellen Clapsaddle"]

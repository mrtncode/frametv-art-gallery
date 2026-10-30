"""Covers the modern, pop and illustration sources, and the keys and flags that gate them.

Run with: pytest tests/test_discover_modern_sources.py
"""

import pytest
from discover_fakes import FakeNet, FakeResponse

from utils.discover import SOURCES, credentials, source_info
from utils.discover.common import DiscoverError, DiskCache
from utils.discover.flickr import flickr
from utils.discover.getty import getty
from utils.discover.pixabay import pixabay
from utils.discover.smithsonian import cooper_hewitt, saam
from utils.discover.wikimedia import illustrations, moma, modern, nga, popart, ukiyoe, yale


@pytest.fixture
def net(monkeypatch, tmp_path):
    monkeypatch.setattr(DiskCache, "directory", str(tmp_path / "cache"))
    credentials.replace_all({})
    yield FakeNet().install(monkeypatch)
    credentials.replace_all({})


def set_keys(**services):
    credentials.replace_all(services)


# --- Keys are entered in Settings --------------------------------------------------


def test_sources_that_need_a_key_refuse_until_it_is_set_in_settings(net):
    needing = {"saam", "cooperhewitt", "flickr", "pixabay"}
    assert needing == {sid for sid, s in SOURCES.items() if source_info(s)["credentials"]}
    assert not any(source_info(s)["credentials"]["configured"] for sid, s in SOURCES.items() if sid in needing)
    with pytest.raises(DiscoverError) as error:
        flickr.search("x", 1, True, "any")
    assert error.value.status == 503 and "Settings" in str(error.value)

    set_keys(flickr={"api_key": "k"}, smithsonian={"api_key": "k"})
    info = {sid: source_info(s)["credentials"]["configured"] for sid, s in SOURCES.items() if sid in needing}
    assert info == {"saam": True, "cooperhewitt": True, "flickr": True, "pixabay": False}


def test_source_info_never_includes_a_secret(net):
    set_keys(flickr={"api_key": "super-secret"})
    assert "super-secret" not in repr(source_info(flickr))


def test_personal_use_sources_are_flagged_and_the_rest_are_not(net):
    assert {sid for sid, s in SOURCES.items() if source_info(s)["flagged"]} == set()


# --- Smithsonian ---------------------------------------------------------------------


def si_record(record_id, title="Pop Study", access="CC0", media_access="CC0", width=4000, height=2250):
    return {
        "id": record_id,
        "content": {
            "freetext": {
                "name": [{"label": "Artist", "content": "Jane Doe, American, 1920-2000"}],
                "date": [{"label": "Date", "content": "1965"}],
            },
            "descriptiveNonRepeating": {
                "title": {"content": title},
                "record_link": f"https://americanart.si.edu/artwork/{record_id}",
                "metadata_usage": {"access": access},
                "online_media": {"media": [{
                    "type": "Images", "idsId": f"SAAM-{record_id}", "usage": {"access": media_access},
                    "resources": [{"label": "High-resolution JPEG", "width": width, "height": height}],
                }]},
            },
        },
    }


def test_smithsonian_searches_one_museum_and_keeps_only_cc0_pictures(net, monkeypatch):
    set_keys(smithsonian={"api_key": "secret"})
    net.add("openaccess/api/v1.0/search", FakeResponse({"response": {"rowCount": 100, "rows": [
        si_record("a"), si_record("b", access="Usage conditions apply"), si_record("c", media_access="Restricted"),
    ]}}))

    page = saam.search('pop" OR unit_code:"X', 2, True, "any")

    params = net.calls[0]["params"]
    assert params["api_key"] == "secret" and params["start"] == 24
    assert params["q"].endswith('AND online_media_type:"Images" AND unit_code:"SAAM"')
    assert 'unit_code:"X' not in params["q"]   # typed operators are neutralised
    assert [item["id"] for item in page["results"]] == ["a"]
    item = page["results"][0]
    assert (item["title"], item["artist"], item["date"]) == ("Pop Study", "Jane Doe", "1965")
    assert item["thumb_url"] == "https://ids.si.edu/ids/deliveryService?id=SAAM-a&max=480"
    assert page["has_more"] is True and page["total"] == 100


def test_smithsonian_download_asks_the_image_server_to_scale_huge_scans(net, monkeypatch):
    set_keys(smithsonian={"api_key": "secret"})
    net.add("content/", FakeResponse({"response": si_record("a", width=12000, height=6000)}))

    plan = cooper_hewitt.plan("a", "fill")

    assert plan.url == "https://ids.si.edu/ids/deliveryService?id=SAAM-a&max=6000"
    assert (plan.width, plan.height) == (6000, 3000)
    assert plan.license == "Public domain (CC0)" and plan.artist == "Jane Doe"


def test_smithsonian_without_a_key_refuses_politely(net):
    with pytest.raises(DiscoverError) as error:
        saam.search("x", 1, True, "any")
    assert error.value.status == 503


# --- Wikimedia Commons: the modern collections ------------------------------------------


def commons_page(page_id, license_name, title="File:Digital sunrise.jpg", artist="Ann Artist"):
    return {"pageid": page_id, "title": title, "index": page_id, "imageinfo": [{
        "width": 4000, "height": 2250, "mime": "image/jpeg",
        "url": f"https://upload.wikimedia.org/original/{page_id}.jpg",
        "thumburl": f"https://upload.wikimedia.org/thumb/{page_id}.jpg",
        "descriptionurl": f"https://commons.wikimedia.org/wiki/{title}",
        "extmetadata": {"LicenseShortName": {"value": license_name}, "Artist": {"value": artist}},
    }]}


def test_modern_collections_accept_credit_licenses_but_never_non_commercial_ones(net):
    pages = {str(i): commons_page(i, name) for i, name in enumerate(
        ["CC BY-SA 4.0", "CC BY 3.0", "CC0", "CC BY-NC 2.0", "CC BY-ND 2.0", "All rights reserved"], start=1)}
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    results = popart.search("sunrise", 1, True, "any")["results"]

    assert [item["id"] for item in results] == ["1", "2", "3"]
    assert results[0]["artist"] == "Ann Artist" and results[0]["license"] == "CC BY-SA 4.0"


def test_modern_collections_search_one_category_and_leave_out_adult_work(net):
    net.add("w/api.php", FakeResponse({"query": {"pages": {}}}))

    popart.search("neon", 1, True, "any")

    search = net.calls[0]["params"]["gsrsearch"]
    assert search.startswith('deepcategory:"Pop art" neon ')
    # Commons does not combine deep categories, and the open art categories hold some adult work.
    assert search.count("deepcategory:") == 1 and "-hentai" in search and "-nude" in search


def test_older_collections_still_take_only_public_domain(net):
    pages = {"1": commons_page(1, "CC BY-SA 4.0"), "2": commons_page(2, "Public domain")}
    net.add("w/api.php", FakeResponse({"query": {"pages": pages}}))

    assert [item["id"] for item in ukiyoe.search("wave", 1, True, "any")["results"]] == ["2"]
    assert illustrations.license_note != ukiyoe.license_note


# --- Flickr ---------------------------------------------------------------------------


def flickr_photo(photo_id, license_code="4", width=3000, height=2000, url=True):
    photo = {"id": photo_id, "owner": "123@N01", "ownername": "Pat", "title": "Mural", "license": license_code,
             "datetaken": "2021-05-01 10:00:00", "url_z": "https://live.staticflickr.com/z.jpg"}
    if url:
        photo.update(url_o="https://live.staticflickr.com/o.jpg", width_o=width, height_o=height)
    return photo


def test_flickr_searches_only_free_licenses_and_credits_the_photographer(net, monkeypatch):
    set_keys(flickr={"api_key": "k"})
    net.add("services/rest", FakeResponse({"stat": "ok", "photos": {"pages": 3, "total": "70", "photo": [
        flickr_photo("1"), flickr_photo("2", license_code="2"), flickr_photo("3", width=900, height=600),
        flickr_photo("4", url=False), flickr_photo("5", license_code="9"),
    ]}}))

    page = flickr.search("street art", 1, True, "any")

    params = net.calls[0]["params"]
    assert params["method"] == "flickr.photos.search" and params["text"] == "street art"
    assert params["license"] == "4,5,9,10"   # never the non-commercial or no-derivatives kinds
    assert [item["id"] for item in page["results"]] == ["1", "5"]
    assert page["results"][0]["license"] == "CC BY (credit the photographer)"
    assert page["results"][1]["license"] == "CC0"
    assert page["results"][0]["artist"] == "Pat" and page["has_more"] is True and page["total"] == 70


def test_flickr_download_uses_the_largest_file_the_owner_allows(net, monkeypatch):
    set_keys(flickr={"api_key": "k"})
    net.add("services/rest", lambda url, params, json, headers: FakeResponse(
        {"stat": "ok", "photo": {"id": "9", "license": "5", "title": {"_content": "Mural"},
                                 "owner": {"realname": "Pat Painter"}, "dates": {"taken": "2020-01-01"},
                                 "urls": {"url": [{"_content": "https://www.flickr.com/photos/pat/9"}]}}}
        if params["method"] == "flickr.photos.getInfo" else
        {"stat": "ok", "sizes": {"size": [
            {"label": "Square", "width": 75, "height": 75, "source": "https://live.staticflickr.com/sq.jpg"},
            {"label": "Large", "width": "1024", "height": "683", "source": "https://live.staticflickr.com/l.jpg"},
            {"label": "Original", "width": "5000", "height": "3333", "source": "https://live.staticflickr.com/o.jpg"},
        ]}}))

    plan = flickr.plan("9", "fill")

    assert plan.url == "https://live.staticflickr.com/o.jpg" and plan.width == 5000
    assert plan.artist == "Pat Painter" and plan.license == "CC BY-SA (credit the photographer)"
    assert flickr.from_url("https://www.flickr.com/photos/pat/9/in/photostream/") == "9"


def test_flickr_hosts_with_numbered_subdomains_are_allowed_for_downloads():
    assert "live.staticflickr.com" in flickr.download_hosts and "farm66.staticflickr.com" in flickr.download_hosts
    assert "evil.example.com" not in flickr.download_hosts


# --- Pixabay --------------------------------------------------------------------------


def test_pixabay_reports_the_real_size_of_the_file_it_will_hand_over(net, monkeypatch):
    set_keys(pixabay={"api_key": "k"})
    net.add("pixabay.com/api", FakeResponse({"totalHits": 100, "hits": [
        {"id": 1, "tags": "cute, cartoon, fox, forest", "user": "Dee", "pageURL": "https://pixabay.com/illustrations/fox-1/",
         "webformatURL": "https://pixabay.com/w.jpg", "largeImageURL": "https://pixabay.com/l.jpg",
         "imageWidth": 6000, "imageHeight": 4000},
        {"id": 2, "tags": "big", "user": "Eve", "pageURL": "https://pixabay.com/illustrations/big-2/",
         "webformatURL": "https://pixabay.com/w2.jpg", "imageURL": "https://pixabay.com/o2.jpg",
         "imageWidth": 6000, "imageHeight": 4000},
    ]}))

    page = pixabay.search("cute fox", 1, True, "any")

    assert net.calls[0]["params"]["image_type"] == "illustration" and net.calls[0]["params"]["key"] == "k"
    small, full = page["results"]
    assert (small["width"], small["height"]) == (1280, 853)   # a free key only gets the 1280 px file
    assert (full["width"], full["height"]) == (6000, 4000)    # an approved key gets the original
    assert small["title"] == "Cute, Cartoon, Fox" and small["artist"] == "Dee"
    assert pixabay.from_url("https://pixabay.com/illustrations/fox-forest-cute-1/") == "1"


def test_smithsonian_collections_have_distinct_units():
    assert (saam.unit, cooper_hewitt.unit) == ("SAAM", "CHNDM")


# --- The Getty ----------------------------------------------------------------------------


GETTY_OBJECT = "https://data.getty.edu/museum/collection/object/"
GETTY_UUID = "4c4741f0-713c-4abe-af4e-979989bc2a6e"
GETTY_IMAGE = "6785ee39-f024-4290-aa8a-41749380c72f"


def getty_row(object_id=GETTY_UUID, title="Landscape with Ruins (83.GG.37)", artist="Jan Both", image=GETTY_IMAGE):
    row = {
        "o": {"value": GETTY_OBJECT + object_id},
        "title": {"value": title},
        "image": {"value": f"https://media.getty.edu/iiif/image/{image}/full/full/0/default.jpg"},
    }
    if artist:
        row["maker"] = {"value": artist}
    return row


def getty_net(net, rows, width=4774, height=2928):
    net.add("/sparql", FakeResponse({"results": {"bindings": rows}}))
    net.add("/info.json", FakeResponse({"width": width, "height": height}))


def test_getty_asks_for_cc0_works_whose_title_has_every_word_and_drops_the_accession_number(net):
    getty_net(net, [getty_row(), getty_row("a" * 8 + "-0000-0000-0000-" + "b" * 12, "Ruins", None, "7fcffc06-b9e3-4664-9082-23ce76125a04")])

    page = getty.search('landscape" } DROP', 1, True, "any")

    query = net.calls[0]["params"]["query"]
    assert "creativecommons.org/publicdomain/zero/1.0/" in query
    assert query.count('CONTAINS(LCASE(STR(?label)), "landscape")') == 1 and '"drop"' in query
    assert 'landscape"' not in query.replace('"landscape")', "")   # typed quotes and braces are neutralised
    assert "300033618" in query and "LIMIT 25 OFFSET 0" in query   # paintings only; one extra row asks "is there more"
    first = page["results"][0]
    assert (first["title"], first["artist"], first["license"]) == ("Landscape with Ruins", "Jan Both", "Public domain (CC0)")
    assert (first["width"], first["height"]) == (4774, 2928)
    assert first["thumb_url"] == f"https://media.getty.edu/iiif/image/{GETTY_IMAGE}/full/480,/0/default.jpg"
    assert page["results"][1]["artist"] == "Unknown artist" and page["has_more"] is False


def test_getty_scales_big_pictures_on_the_museums_image_server(net):
    getty_net(net, [getty_row()], width=9000, height=6000)

    plan = getty.plan(GETTY_UUID, "fill")

    assert plan.url == f"https://media.getty.edu/iiif/image/{GETTY_IMAGE}/full/3840,/0/default.jpg"
    assert (plan.width, plan.height) == (3840, 2560) and plan.artist == "Jan Both"
    with pytest.raises(DiscoverError):
        getty.plan("not-an-id", "fill")


def test_getty_does_not_lose_a_picture_whose_size_it_cannot_read(net):
    net.add("/sparql", FakeResponse({"results": {"bindings": [getty_row()]}}))
    net.add("/info.json", FakeResponse({}, status=500))

    item = getty.search("landscape", 1, True, "any")["results"][0]

    assert item["width"] is None and item["crop_loss"] is None


# --- Museums that donated their images to Commons -------------------------------------------


def test_the_nga_yale_and_moma_collections_search_their_own_commons_category(net):
    net.add("w/api.php", FakeResponse({"query": {"pages": {}}}))

    nga.search("monet", 1, True, "any")
    yale.search("", 1, True, "any")
    moma.search("van gogh", 1, True, "any")

    nga_search, yale_search, moma_search = (c["params"]["gsrsearch"] for c in net.calls)
    assert nga_search.startswith('deepcategory:"Paintings in the National Gallery of Art (Washington, D.C.)" monet')
    assert yale_search.startswith('deepcategory:"Paintings in the Yale Center for British Art" landscape')
    assert moma_search.startswith('deepcategory:"Paintings in the Museum of Modern Art" van gogh')

"""Covers the personal-use sources that need no key: Danbooru, Konachan and Bing wallpapers.

Run with: pytest tests/test_discover_unverified_sources.py
"""

import pytest
from discover_fakes import FakeNet, FakeResponse

from utils.discover.bing import bing
from utils.discover.common import DiscoverError, DiskCache
from utils.discover.danbooru import danbooru
from utils.discover.konachan import konachan

import sys

bing_module = sys.modules["utils.discover.bing"]


@pytest.fixture
def net(monkeypatch, tmp_path):
    monkeypatch.setattr(DiskCache, "directory", str(tmp_path / "cache"))
    return FakeNet().install(monkeypatch)


def test_all_of_them_are_flagged_as_personal_use():
    for source in (danbooru, konachan, bing):
        assert source.flagged is True and source.license_note == "License not verified (personal use)"


# --- Danbooru ---------------------------------------------------------------------------


def booru_post(post_id, rating="g", width=4096, height=2400, ext="jpg", url=True, banned=False, size=900_000):
    return {
        "id": post_id, "rating": rating, "image_width": width, "image_height": height, "file_ext": ext,
        "file_size": size, "is_banned": banned, "created_at": "2026-09-30T10:00:00.000-04:00",
        "file_url": f"https://cdn.donmai.us/original/{post_id}.{ext}" if url else None,
        "large_file_url": f"https://cdn.donmai.us/sample/{post_id}.jpg",
        "tag_string_artist": "some_artist", "tag_string_copyright": "genshin_impact",
        "tag_string_character": "vodyanitsa_(genshin_impact) other",
    }


def test_danbooru_asks_for_the_general_rating_and_one_tag_and_keeps_only_big_clean_posts(net):
    net.add("posts.json", FakeResponse([
        booru_post(1), booru_post(2, rating="q"), booru_post(3, width=1500, height=900), booru_post(4, url=False),
        booru_post(5, banned=True), booru_post(6, ext="zip"), booru_post(7, size=999_000_000),
    ]))

    page = danbooru.search("Cat! dog", 2, True, "any")

    params = net.calls[0]["params"]
    assert params["tags"] == "rating:g cat" and params["page"] == 2   # two-tag limit: the rating and one tag
    assert [item["id"] for item in page["results"]] == ["1"]
    item = page["results"][0]
    assert (item["title"], item["artist"], item["license"]) == ("Vodyanitsa", "Some Artist", "License not verified (personal use)")
    assert item["thumb_url"].startswith("https://cdn.donmai.us/sample/")


def test_danbooru_reports_a_search_it_refused(net):
    net.add("posts.json", FakeResponse({"success": False, "message": "You cannot search for more than 2 tags at a time."}))
    with pytest.raises(DiscoverError):
        danbooru.search("x", 1, True, "any")


def test_danbooru_downloads_the_original_and_recognises_post_links(net):
    net.add("/posts/9.json", FakeResponse(booru_post(9)))

    plan = danbooru.plan("9", "fill")

    assert plan.url == "https://cdn.donmai.us/original/9.jpg" and plan.artist == "Some Artist"
    assert danbooru.from_url("https://danbooru.donmai.us/posts/9") == "9"
    with pytest.raises(DiscoverError):
        danbooru.plan("../etc", "fill")


# --- Konachan ---------------------------------------------------------------------------


def moe_post(post_id, rating="s", width=3840, height=2160, ext="png", size=5_000_000):
    return {
        "id": post_id, "rating": rating, "width": width, "height": height, "file_size": size,
        "tags": "clouds scenic sunset sky", "file_url": f"https://konachan.net/image/{post_id}/x.{ext}",
        "sample_url": f"https://konachan.net/sample/{post_id}/s.jpg",
    }


def test_konachan_searches_safe_large_posts_by_every_word(net):
    net.add("post.json", FakeResponse([moe_post(1), moe_post(2, rating="q"), moe_post(3, width=1280, height=720),
                                       moe_post(4, ext="gif")]))

    page = konachan.search("Sunset Sky", 1, True, "any")

    tags = net.calls[0]["params"]["tags"].split(" ")
    assert {"rating:safe", "width:1920..", "sunset", "sky"} <= set(tags)
    assert [item["id"] for item in page["results"]] == ["1"]
    assert page["results"][0]["title"] == "Clouds Scenic Sunset"
    assert konachan.from_url("https://konachan.net/post/show/42/some-tags") == "42"


# --- Bing ------------------------------------------------------------------------------


def bing_image(name, title, copyright_text, market="EN-US"):
    return {"urlbase": f"/th?id=OHR.{name}_{market}123", "title": title, "copyright": copyright_text,
            "copyrightlink": f"https://www.bing.com/search?q={name}", "startdate": "20261002"}


def test_bing_gathers_the_markets_once_each_and_searches_the_text(net):
    def answer(url, params, json, headers):
        if params["mkt"] == "en-US":
            return FakeResponse({"images": [
                bing_image("Chattooga", "A river worth protecting", "Chattooga River, North Carolina (© mtilghma/Getty Images)"),
                bing_image("Desert", "Dunes", "Sand dunes (© Sam Smith/Getty Images)"),
            ]})
        if params["mkt"] == "de-DE":
            # The same photo as in the US list, with another market suffix: not shown twice.
            return FakeResponse({"images": [bing_image("Chattooga", "Ein Fluss", "Fluss (© mtilghma/Getty Images)", "DE-DE")]})
        return FakeResponse({"images": []})
    net.add("HPImageArchive", answer)

    everything = bing.search("", 1, True, "any")
    rivers = bing.search("RIVER", 1, True, "any")

    assert everything["total"] == 2
    assert [item["title"] for item in rivers["results"]] == ["A river worth protecting"]
    item = rivers["results"][0]
    assert (item["artist"], item["width"], item["height"]) == ("mtilghma/Getty Images", 3840, 2160)
    assert item["thumb_url"].endswith("_800x480.jpg") and item["license"] == "License not verified (personal use)"


def test_bing_downloads_the_uhd_file_and_does_not_fail_when_a_market_does(net):
    def answer(url, params, json, headers):
        if params["mkt"] == "ja-JP":
            return FakeResponse({}, status=500)
        return FakeResponse({"images": [bing_image("Chattooga", "A river", "River (© Someone)")]} if params["mkt"] == "en-US" else {"images": []})
    net.add("HPImageArchive", answer)

    plan = bing.plan("OHR.Chattooga_EN-US123", "fill")

    assert plan.url == "https://www.bing.com/th?id=OHR.Chattooga_EN-US123_UHD.jpg" and plan.width == 3840
    with pytest.raises(DiscoverError):
        bing.plan("OHR.Missing_EN-US1", "fill")

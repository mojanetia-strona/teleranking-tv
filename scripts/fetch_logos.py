"""Pobiera logotypy kanałów i serwisów streamingowych i zapisuje je jako małe WebP w public/logos/.

Uruchamiane w GitHub Actions (tam jest dostęp do stron operatorów). Pobiera tylko brakujące pliki.
SVG są rasteryzowane (na serwerze strony nie trzymamy SVG, bo mogą zawierać skrypty).
Logo na przezroczystym tle, dopasowane do 160x96 px.
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_public import ROOT, fname, norm, svkey  # noqa: E402

from PIL import Image  # noqa: E402

OUT = ROOT / "public" / "logos"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
W, H = 160, 96


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,*/*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(5_000_000), r.headers.get("Content-Type", "")


def to_webp(raw, ctype, url, path):
    if "svg" in ctype or url.lower().endswith(".svg") or raw.lstrip()[:5] in (b"<?xml", b"<svg "):
        import cairosvg
        raw = cairosvg.svg2png(bytestring=raw, output_width=W * 2)
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((W, H), Image.LANCZOS)
    im.save(path, "WEBP", quality=88, method=6)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    tv = json.loads((ROOT / "public" / "tv.json").read_text(encoding="utf-8"))
    src = json.loads((ROOT / "data" / "logos.json").read_text(encoding="utf-8"))
    urls = {}
    for name, url in src.items():
        k = fname(norm(name))
        urls.setdefault(k, url)
    ok = bad = 0
    for k in tv["kanaly"]:
        path = OUT / f"{k}.webp"
        if path.exists() or k not in urls:
            continue
        try:
            raw, ct = get(urls[k])
            to_webp(raw, ct, urls[k], path)
            ok += 1
        except Exception as e:  # jedno logo nie zatrzymuje reszty
            bad += 1
            print(f"logo {k}: {e}")
    # serwisy streamingowe
    sl = ROOT / "data" / "streaming-logos.json"
    if sl.exists():
        for name, url in json.loads(sl.read_text(encoding="utf-8")).items():
            path = OUT / f"s-{svkey(name)}.webp"
            if path.exists():
                continue
            try:
                raw, ct = get(url)
                to_webp(raw, ct, url, path)
                ok += 1
            except Exception as e:
                bad += 1
                print(f"logo {name}: {e}")
    print(f"logotypy: pobrano {ok}, błędy {bad}, razem w folderze {len(list(OUT.glob('*.webp')))}")


if __name__ == "__main__":
    main()

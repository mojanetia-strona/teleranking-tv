"""Buduje publiczną wersję bazy TV dla porównywarki na teleranking.pl: public/tv.json.

Tylko informacje dla klienta: kanały, pakiety, dodatki, streaming z cenami, multiroom w skrócie.
Bez notatek wewnętrznych i bez punktów "do sprawdzenia". Logotypy: public/logos/<klucz>.webp
(pobiera je scripts/fetch_logos.py w GitHub Actions).
"""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "public"

# Kolejność przy remisie (zasada biznesowa): Netia, T-Mobile, pozostali, INEA na końcu.
KOLEJNOSC = ["netia", "t-mobile", "orange", "play", "plus", "vectra", "inea"]

# Warianty (linie) oferty: pakiety bazowe od najmniejszego. Pozostałe pakiety/dodatki z listy "dodatki"
# działają jako dodatki. Czego nie ma w żadnej linii ani w dodatkach, nie pokazujemy klientom.
LINIE = {
    "netia": [{"id": "tv", "nazwa": "Telewizja Netia", "bazowe": ["netia-xs", "netia-s", "netia-m", "netia-l"]}],
    "t-mobile": [{"id": "tv", "nazwa": "MagentaTV", "bazowe": ["tmobile-dla-kazdego", "tmobile-midi", "tmobile-maxi"]}],
    "orange": [{"id": "tv", "nazwa": "Orange TV", "bazowe": ["orange-start-tv", "orange-extra-tv"]}],
    "play": [{"id": "tv", "nazwa": "Telewizja Play", "bazowe": ["play-start", "play-tng", "play-max", "play-max-premium"]}],
    "plus": [{"id": "tv", "nazwa": "Polsat Box (w Plusie)", "bazowe": ["plus-s", "plus-m", "plus-l"]}],
    "vectra": [
        {"id": "kablowa", "nazwa": "Telewizja kablowa", "bazowe": ["vectra-stalowy", "vectra-srebrny", "vectra-zloty", "vectra-platynowy", "vectra-super-film-sport"]},
        {"id": "smart", "nazwa": "TV Smart (przez internet)", "bazowe": ["vectra-smart-start", "vectra-smart-standard", "vectra-smart-max"]},
    ],
    "inea": [
        {"id": "gpon", "nazwa": "Światłowód (HIWAY)", "bazowe": ["inea-start-regio", "inea-classic", "inea-extra"],
         "dodatki_pakiety": ["inea-film", "inea-kids", "inea-sport", "inea-document", "inea-eleven", "inea-eurosport", "inea-play"]},
        {"id": "hfc", "nazwa": "Sieć kablowa (HFC)", "bazowe": ["inea-hfc-basic", "inea-hfc-economy", "inea-hfc-select"],
         "dodatki_pakiety": ["inea-hfc-movie-pack", "inea-hfc-kids-pack", "inea-hfc-sport-pack-plus", "inea-hfc-docu-pack", "inea-hfc-eleven-sports", "inea-hfc-gold"]},
    ],
}
# Dodatki niepokazywane klientom (punkty w TNG, pakiety bez listy kanałów, usługi, które nie są kanałami).
POMIN_DODATKI = {
    "play-filmy-seriale", "play-sport", "play-polsat-ott", "play-info", "play-kids", "play-lifestyle", "play-dokumenty",
    "play-tvp", "play-relax", "play-film-sport", "plus-ott-pakiety-dodatkowe", "tmobile-multiroom",
}

KATEGORIE = {
    "ogólne": "Ogólne", "informacyjne": "Informacje", "sportowe": "Sport", "filmy i seriale": "Filmy i seriale",
    "dokumentalne": "Dokument i przyroda", "dla dzieci": "Dla dzieci", "lifestyle": "Rozrywka i lifestyle",
    "muzyczne": "Muzyka", "zagraniczne": "Zagraniczne", "regionalne": "Regionalne", "dla dorosłych": "Dla dorosłych",
    "inne": "Rozrywka i lifestyle",
}
KAT_KOLEJNOSC = ["Ogólne", "Informacje", "Sport", "Filmy i seriale", "Dokument i przyroda", "Dla dzieci",
                 "Rozrywka i lifestyle", "Muzyka", "Zagraniczne", "Regionalne", "Dla dorosłych"]

POPULARNE = ["tvn24", "polsatsport1", "elevensports1", "canal+sport", "eurosport1", "hbo", "tvpsport",
             "disneychannel", "polsatsportpremium1", "discoverychannel", "canal+premium", "nationalgeographic"]

# Ten sam kanał pod różnymi nazwami -> jeden klucz (wspólne z apką wewnętrzną).
ALIAS = {
    "tvnsiedem": "tvn7", "tvn24biznesiswiat": "tvn24bis", "telewizjarepublika": "republika", "tvrepublika": "republika",
    "newsmaxpolska": "newsmax", "newsmax": "newsmax", "wpolscepl": "wpolsce24", "wpolsce24pl": "wpolsce24", "wpolsce": "wpolsce24",
    "discovery": "discoverychannel", "hbo1": "hbo", "cinemax1": "cinemax", "nationalgeographicchannel": "nationalgeographic",
    "scifi": "scifiuniversal", "sundance": "sundancetv", "e": "eentertainment", "dwtv": "dw", "dwenglish": "dw", "dweng": "dw",
    "deutschewelledw": "dw", "france24ang": "france24en", "france24english": "france24en", "france24eng": "france24en",
    "france24fra": "france24fr", "france24french": "france24fr", "france24franc": "france24fr", "france24francais": "france24fr",
    "euronewspolski": "euronewspl", "arirangtv": "arirang", "studiomedtv": "studiomed", "currenttimetv": "currenttime",
    "belsattv": "belsat", "espresotv": "espreso", "ewtnpolska": "ewtn", "dachatv": "dacha", "366tv": "366",
    "ginxesportstv": "ginx", "hustlertv": "hustler", "redlighttv": "redlight", "brazzerstv": "brazzers", "brazzerstveurope": "brazzers",
    "bloombergtelevision": "bloomberg", "canal+4kultra": "canal+4k", "polsatviasatexplorer": "polsatviasatexplore",
    "paramountnetworkpolska": "paramountnetwork", "viasttruecrime": "viasattruecrime", "mtv": "mtvpolska",
    "funboxu": "funboxuhd", "privatetv": "private", "id": "idinvestigationdiscovery", "natgeowild": "nationalgeographicwild",
    "tvtrwam": "trwam", "eurosport": "eurosport1", "zoomtv": "zoom", "fokustv": "fokus", "crimeinvestigationpolsat": "polsatcrimeinvestigation",
    "tv4": "tv4", "puls": "tvpuls", "puls2": "tvpuls2", "tv6": "tv6", "canal+sport1": "canal+sport", "tvp": "tvphd",
    "zero": "kanalzero", "filmax4k": "filmax", "travelxp4k": "travelxp", "museum4k": "museum", "myzentv4k": "myzen",
    "myzen4k": "myzen", "lovenature4k": "lovenature", "inultra4k": "inultra", "starstv": "stars", "starstv.": "stars",
    "ttv": "ttv", "polsatnews": "polsatnews", "antenatv": "antena", "eskarock": "eskarocktv", "eskaextratv": "eskatvextra",
    "metrotv": "metro", "musicboxpolska": "musicbox", "stopklatkatv": "stopklatka",
}
TVP3_REG = re.compile(r"^(tvp ?3 ?)?(tvp )?(bialystok|bydgoszcz|gdansk|gorzow|katowice|kielce|krakow|lublin|lodz|olsztyn|opole|poznan|rzeszow|szczecin|warszawa|wroclaw)")


def ascii_low(s):
    s = unicodedata.normalize("NFD", (s or "").lower()).replace("ł", "l")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def norm(name):
    a = ascii_low(name).replace("ł", "l")
    if TVP3_REG.match(a.replace("tvp3", "tvp 3")):
        return "tvp3"
    k = re.sub(r"\b(fhd|hd|sd)\b", " ", a)
    k = re.sub(r"[^a-z0-9+]", "", k)
    if k.startswith("tvp3"):
        return "tvp3"
    return ALIAS.get(k, k)


def ladna_nazwa(warianty):
    """Najczęstsza nazwa, wśród równych wybierz nie-WIELKIMI-LITERAMI i bez dopisku HD."""
    c = Counter(warianty)
    def ocena(n):
        litery = [ch for ch in n if ch.isalpha()]
        caps = sum(ch.isupper() for ch in litery) / max(1, len(litery))
        return (caps > 0.7, " HD" in n, -c[n], len(n))
    return sorted(c, key=ocena)[0]


def main():
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    ops = {s: json.loads((DATA / "operators" / f"{s}.json").read_text(encoding="utf-8")) for s in index["operatorzy"]}
    nazwy = defaultdict(list)
    kat = defaultdict(Counter)
    jak = defaultdict(Counter)
    out_ops = []

    for slug in sorted(ops, key=lambda s: KOLEJNOSC.index(s) if s in KOLEJNOSC else 50):
        d = ops[slug]
        pak = {p["id"]: p for p in d["pakiety"]}
        dod = {x["id"]: x for x in d["dodatki"] if x["id"] not in POMIN_DODATKI}
        # kanał -> {pakiety}, kanał -> {dodatki}
        ch_p = defaultdict(set)
        ch_d = defaultdict(set)
        for k in d["kanaly"]:
            key = norm(k["nazwa"])
            if not key:
                continue
            nazwy[key].append(k["nazwa"])
            kat[key][KATEGORIE.get(k.get("kategoria", "inne"), "Rozrywka i lifestyle")] += 1
            if k.get("jakosc"):
                jak[key][k["jakosc"]] += 1
            for p in k.get("pakiety", []):
                ch_p[key].add(p)
            for m in re.findall(r"dodatek:\s*([\w.-]+)", k.get("uwagi") or "", re.I):
                if m in dod:
                    ch_d[key].add(m)
        for x in dod.values():
            for n in x.get("kanaly", []):
                key = norm(n)
                if key:
                    nazwy[key].append(n)
                    ch_d[key].add(x["id"])
        linie = []
        for L in LINIE.get(slug, []):
            bazowe = [b for b in L["bazowe"] if b in pak]
            # dodatki w linii: pakiety tematyczne linii + zwykłe dodatki operatora
            extra_pak = [p for p in L.get("dodatki_pakiety", []) if p in pak]
            pakiety = []
            for b in bazowe:
                p = pak[b]
                lista = sorted(k for k, s in ch_p.items() if b in s)
                stated = p.get("liczba_kanalow") or 0
                pakiety.append({
                    "id": b, "nazwa": p["nazwa"].split(" (")[0] if slug == "vectra" and "TV Smart" in p["nazwa"] else p["nazwa"],
                    "liczba": stated if stated >= len(lista) else len(lista),
                    "kanaly": lista,
                })
            dodatki = []
            for pid in extra_pak:
                p = pak[pid]
                dodatki.append({"id": pid, "nazwa": p["nazwa"].replace(" (HFC)", ""),
                                "kanaly": sorted(k for k, s in ch_p.items() if pid in s), "warunki": ""})
            for x in dod.values():
                lista = sorted(k for k, s in ch_d.items() if x["id"] in s)
                if not lista:
                    continue
                dodatki.append({"id": x["id"], "nazwa": x["nazwa"], "kanaly": lista,
                                "warunki": (x.get("warunki") or "")[:220]})
            linie.append({"id": L["id"], "nazwa": L["nazwa"], "pakiety": pakiety, "dodatki": dodatki})

        zr = {z["id"]: z for z in d.get("zrodla", [])}
        streaming = []
        for s in d.get("streaming", []):
            serwis = s.get("wariant") if (s.get("serwis") or "").strip().lower() == "inny" and s.get("wariant") else s.get("serwis")
            u = next((zr[i]["url"] for i in s.get("zrodla", []) if i in zr and zr[i].get("url")), "")
            streaming.append({
                "key": svkey(serwis), "l": 1 if (OUT / "logos" / f"s-{svkey(serwis)}.webp").exists() else 0, "serwis": serwis, "wariant": "" if serwis == s.get("wariant") else (s.get("wariant") or ""),
                "dostepny": not re.match(r"^\s*brak", s.get("dostepnosc") or "", re.I),
                "typ": s.get("typ") or "", "krotko": s.get("krotko") or "", "uwaga": s.get("uwaga") or "",
                "dostepnosc": s.get("dostepnosc") or "", "cena": s.get("cena") or "", "zasady": s.get("zasady") or "", "zrodlo": u,
            })
        m = d.get("multiroom") or {}
        f = d.get("sprzet_i_funkcje") or {}
        a = f.get("aplikacja") or {}
        lista_zr = next((z["url"] for z in d.get("zrodla", []) if z.get("typ") in ("pdf", "strona") and z.get("url")), "")
        out_ops.append({
            "slug": slug, "nazwa": d["operator"], "stan_na": d.get("sprawdzono", ""), "zrodlo": lista_zr,
            "linie": linie, "streaming": streaming,
            "multiroom": {"dostepny": m.get("dostepny"), "max": m.get("max_odbiornikow"), "opis": m.get("jak_dziala") or ""},
            "aplikacja": {"nazwa": a.get("nazwa") or "", "urzadzenia": a.get("urzadzenia") or ""},
        })

    # słownik kanałów
    logos_dir = OUT / "logos"
    kanaly = {}
    for key, ws in nazwy.items():
        n = ladna_nazwa(ws)
        if key == "tvp3":
            n = "TVP3 (regionalna)"
        q = jak[key].most_common(1)[0][0] if jak[key] else ""
        kanaly[key] = {
            "n": n,
            "k": kat[key].most_common(1)[0][0] if kat[key] else "Rozrywka i lifestyle",
            "q": "4K" if "4k" in ascii_low(n) or q == "4K" else ("HD" if q == "HD" else ""),
            "l": 1 if (logos_dir / f"{fname(key)}.webp").exists() else 0,
        }
    # tylko kanały, które gdzieś są w pokazywanych pakietach/dodatkach
    used = set()
    for o in out_ops:
        for L in o["linie"]:
            for p in L["pakiety"] + L["dodatki"]:
                used.update(p["kanaly"])
    kanaly = {k: v for k, v in kanaly.items() if k in used}
    for o in out_ops:  # pakiety odwołują się do kluczy kanałów
        for L in o["linie"]:
            for p in L["pakiety"] + L["dodatki"]:
                p["kanaly"] = [fname(k) for k in p["kanaly"]]
    kanaly = {fname(k): v for k, v in kanaly.items()}

    out = {
        "wersja": 1, "aktualizacja": index.get("aktualizacja", ""), "kolejnosc": KOLEJNOSC,
        "kategorie": KAT_KOLEJNOSC, "popularne": [fname(p) for p in POPULARNE if fname(p) in kanaly],
        "kanaly": kanaly, "operatorzy": out_ops,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "tv.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"public/tv.json: {len(kanaly)} kanałów, {len(out_ops)} operatorów, logo: {sum(v['l'] for v in kanaly.values())}")


SVC = {"max": "hbomax", "hbo": "hbomax", "hbomaxzhbo": "hbomax", "canalplus": "canalplusonline", "canalplusonline": "canalplusonline",
       "primevideo": "amazonprimevideo", "amazonprime": "amazonprimevideo", "disney": "disneyplus", "eleven": "elevensports",
       "filmboxplusstream": "filmboxplus", "filmbox": "filmboxplus", "appletvplus": "appletv"}


def svkey(name):
    k = fname(re.sub(r"[^a-z0-9+]", "", ascii_low(re.sub(r"\(.*?\)", "", name or ""))))
    return SVC.get(k, k)


def fname(key):
    """Klucz kanału bezpieczny dla nazw plików i URL ('+' -> 'plus')."""
    return key.replace("+", "plus")


if __name__ == "__main__":
    main()

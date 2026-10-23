"""Cotygodniowa aktualizacja bazy TV (teleranking-tv).

Dla każdego operatora z data/index.json:
  1. wysyła do Claude API obecne dane + listę źródeł,
  2. Claude sam szuka i czyta oficjalne strony/PDF-y operatora (web_search + web_fetch),
  3. zwraca BEZ_ZMIAN albo pełny, zaktualizowany JSON,
  4. skrypt sprawdza wynik (walidacja + bezpieczniki), liczy różnice i zapisuje.
Na końcu dopisuje wpis do data/changelog.json i wysyła raport do Make (webhook -> mail).

Zmienne środowiskowe:
  ANTHROPIC_API_KEY  (wymagana)
  MAKE_WEBHOOK_URL   (opcjonalna; bez niej raport tylko w logu)
  MODEL              (domyślnie claude-sonnet-5-5)
  ONLY               (opcjonalnie: slugi oddzielone przecinkami, np. "netia,vectra")
"""
import datetime as dt
import json
import os
import re
import sys
import traceback
import urllib.request
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OPS_DIR = DATA / "operators"
SCHEMA = (ROOT / "schema" / "operator.schema.md").read_text(encoding="utf-8")
MODEL = os.environ.get("MODEL", "claude-sonnet-5-5")
# twardy limit tokenów wejściowych na jednego operatora (bezpiecznik kosztów)
MAX_INPUT_PER_OP = int(os.environ.get("MAX_INPUT_PER_OP", "700000"))
TODAY = dt.date.today().isoformat()
REQUIRED = ["operator", "slug", "zrodla", "pakiety", "kanaly", "dodatki", "streaming", "multiroom",
            "sprzet_i_funkcje", "warunki_ogolne", "faq", "do_sprawdzenia"]

SYSTEM = f"""Jesteś analitykiem rynku telekomunikacyjnego w Polsce. Prowadzisz wewnętrzną bazę wiedzy o ofercie
TELEWIZJI operatorów dla handlowców porównywarki teleranking.pl. Dziś jest {TODAY}.

Twoje zadanie: sprawdzić, czy dane operatora są nadal aktualne, i je poprawić.

Zasady (bezwzględne):
- Źródła faktów: wyłącznie oficjalne strony operatora, oficjalne PDF z listami kanałów, regulaminy i cenniki promocji.
  Portale porównawcze i fora mogą tylko podpowiedzieć, gdzie szukać.
- Nie zgaduj. Czego nie da się potwierdzić w oficjalnym źródle, nie wpisuj jako faktu, tylko dodaj do "do_sprawdzenia".
- Nie usuwaj danych tylko dlatego, że nie udało się otworzyć źródła. Usuwasz kanał/pakiet/dodatek wyłącznie wtedy,
  gdy aktualne oficjalne źródło pokazuje, że go już nie ma. Jeśli źródło jest niedostępne, zostaw dane i dopisz to do "do_sprawdzenia".
- Bez cen pakietów TV. WYJĄTEK: w sekcji "streaming" podawaj aktualne ceny i zasady (promocje, okres, warunki).
- Oszczędzaj: czytaj tylko źródła potrzebne do weryfikacji (najpierw lista kanałów i strona streamingów), nie czytaj wielu podobnych stron. Jeśli główne źródła się nie zmieniły, odpowiedz BEZ_ZMIAN.
- Najpierw sprawdź źródła z obecnych danych (lista URL w wiadomości), potem poszukaj nowszych wersji (np. nowy PDF z listą kanałów).
- Teksty po polsku.

Format danych (trzymaj się go dokładnie, te same klucze):
{SCHEMA}

Odpowiedź końcowa (po zakończeniu sprawdzania) MUSI mieć jedną z dwóch postaci:
A) Jeśli nic się nie zmieniło: jedna linia `BEZ_ZMIAN`, a pod nią krótko, co sprawdziłeś.
B) Jeśli coś się zmieniło albo poprawiasz błędy: blok ```json z obiektem
   {{"zmiany": ["krótki opis każdej zmiany po polsku"], "dane": {{...pełny, kompletny plik operatora...}}}}
   W "dane" ustaw "sprawdzono": "{TODAY}". Zwróć CAŁY plik (wszystkie kanały, pakiety, FAQ), nie fragment.
"""


def log(*a):
    print(*a, flush=True)


def call_claude(client, user_msg):
    """Wywołanie z obsługą pause_turn (długie przeszukiwanie po stronie serwera)."""
    messages = [{"role": "user", "content": user_msg}]
    tools = [
        {"type": "web_search_20260318", "name": "web_search", "max_uses": 5,
         "user_location": {"type": "approximate", "country": "PL", "timezone": "Europe/Warsaw"}},
        {"type": "web_fetch_20260318", "name": "web_fetch", "max_uses": 10, "max_content_tokens": 40000},
    ]
    usage = {"input": 0, "output": 0, "searches": 0}
    for _ in range(8):
        with client.messages.stream(model=MODEL, max_tokens=64000, system=SYSTEM,
                                    messages=messages, tools=tools) as stream:
            msg = stream.get_final_message()
        u = msg.usage
        usage["input"] += (u.input_tokens or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0)
        usage["output"] += u.output_tokens or 0
        stu = getattr(u, "server_tool_use", None)
        if stu is not None:
            usage["searches"] += getattr(stu, "web_search_requests", 0) or 0
        if msg.stop_reason == "pause_turn":
            if usage["input"] > MAX_INPUT_PER_OP:
                raise RuntimeError(f"Przekroczony limit kosztów dla operatora ({usage['input']} tokenów), dane bez zmian")
            messages.append({"role": "assistant", "content": msg.content})
            continue
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        return text, usage, msg.stop_reason
    raise RuntimeError("Za dużo wznowień (pause_turn)")


def parse_answer(text):
    if re.search(r"^\s*BEZ_ZMIAN", text, re.M) and "```json" not in text:
        return None, []
    blocks = re.findall(r"```json\s*(.*?)```", text, re.S)
    if not blocks:
        raise ValueError("Brak bloku JSON i brak BEZ_ZMIAN w odpowiedzi")
    obj = json.loads(max(blocks, key=len))
    return obj["dane"], obj.get("zmiany", [])


def norm(n):
    n = (n or "").lower()
    n = re.sub(r"\b(uhd|fhd|hd|sd|4k)\b", " ", n)
    return re.sub(r"[^0-9a-ząćęłńóśźż+]", "", n)


def validate(new, old, slug):
    missing = [k for k in REQUIRED if k not in new]
    if missing:
        raise ValueError(f"Brak pól: {missing}")
    if new.get("slug") != slug:
        raise ValueError(f"Zły slug: {new.get('slug')}")
    if old:
        o, n = len(old.get("kanaly", [])), len(new.get("kanaly", []))
        if o >= 20 and n < o * 0.6:
            raise ValueError(f"Podejrzany spadek liczby kanałów: {o} -> {n} (odrzucono, zostają stare dane)")
        if len(old.get("pakiety", [])) and not new.get("pakiety"):
            raise ValueError("Nowe dane nie mają żadnego pakietu (odrzucono)")


def diff(old, new):
    out = []
    if not old:
        return [f"Nowy operator w bazie: {len(new.get('pakiety', []))} pakietów, {len(new.get('kanaly', []))} kanałów"]
    op = {p["id"]: p for p in old.get("pakiety", [])}
    np_ = {p["id"]: p for p in new.get("pakiety", [])}
    for i in np_.keys() - op.keys():
        out.append(f"Nowy pakiet: {np_[i].get('nazwa')}")
    for i in op.keys() - np_.keys():
        out.append(f"Usunięty pakiet: {op[i].get('nazwa')}")

    def chmap(d):
        return {norm(k["nazwa"]): k for k in d.get("kanaly", [])}

    oc, nc = chmap(old), chmap(new)
    added = [nc[k]["nazwa"] for k in nc.keys() - oc.keys()]
    removed = [oc[k]["nazwa"] for k in oc.keys() - nc.keys()]
    if added:
        out.append("Nowe kanały: " + ", ".join(sorted(added)))
    if removed:
        out.append("Usunięte kanały: " + ", ".join(sorted(removed)))
    moved = []
    for k in nc.keys() & oc.keys():
        if sorted(nc[k].get("pakiety", [])) != sorted(oc[k].get("pakiety", [])):
            moved.append(nc[k]["nazwa"])
    if moved:
        out.append("Zmiana pakietów dla kanałów: " + ", ".join(sorted(moved)[:40]) + (" i inne" if len(moved) > 40 else ""))
    od = {d["id"]: d for d in old.get("dodatki", [])}
    nd = {d["id"]: d for d in new.get("dodatki", [])}
    for i in nd.keys() - od.keys():
        out.append(f"Nowy dodatek: {nd[i].get('nazwa')}")
    for i in od.keys() - nd.keys():
        out.append(f"Usunięty dodatek: {od[i].get('nazwa')}")
    os_ = {s.get("serwis"): s.get("dostepnosc") for s in old.get("streaming", [])}
    ns = {s.get("serwis"): s.get("dostepnosc") for s in new.get("streaming", [])}
    for s in ns:
        if os_.get(s) != ns[s]:
            out.append(f"Streaming {s}: {os_.get(s, 'brak')} -> {ns[s]}")
    if json.dumps(old.get("multiroom"), sort_keys=True) != json.dumps(new.get("multiroom"), sort_keys=True):
        out.append("Zmiana w opisie multiroomu")
    return out


def send_report(report):
    url = os.environ.get("MAKE_WEBHOOK_URL")
    if not url:
        log("Brak MAKE_WEBHOOK_URL, raport tylko w logu")
        return
    req = urllib.request.Request(url, data=json.dumps(report, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "User-Agent": "teleranking-tv/1.0 (+https://github.com/mojanetia-strona/teleranking-tv)"})
    urllib.request.urlopen(req, timeout=60).read()
    log("Raport wysłany do Make")


def main():
    ws = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
    client = anthropic.Anthropic(default_headers={"anthropic-workspace-id": ws} if ws else None)
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    only = [s.strip() for s in os.environ.get("ONLY", "").split(",") if s.strip()]
    slugs = [s for s in index["operatorzy"] if not only or s in only]
    report = {"data": TODAY, "operatorzy": [], "bledy": [], "bez_zmian": [], "koszt": {"input": 0, "output": 0, "searches": 0}}
    entry = {"data": TODAY, "operatorzy": []}

    for slug in slugs:
        path = OPS_DIR / f"{slug}.json"
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        name = (old or {}).get("operator", slug)
        log(f"== {name} ==")
        urls = "\n".join(f"- {z.get('url')}" for z in (old or {}).get("zrodla", []) if z.get("url"))
        user = (f"Operator: {name} (slug: {slug}).\n\nŹródła z poprzedniego sprawdzenia:\n{urls or '(brak, znajdź oficjalne)'}\n\n"
                f"Obecne dane:\n```json\n{json.dumps(old, ensure_ascii=False) if old else '{}'}\n```\n\n"
                "Sprawdź aktualność i odpowiedz zgodnie z instrukcją (BEZ_ZMIAN albo pełny JSON).")
        try:
            text, usage, stop = call_claude(client, user)
            for k in usage:
                report["koszt"][k] += usage[k]
            log(f"stop={stop} usage={usage}")
            if stop == "max_tokens":
                raise ValueError("Odpowiedź ucięta (max_tokens)")
            new, notes = parse_answer(text)
            if new is None:
                old["sprawdzono"] = TODAY
                path.write_text(json.dumps(old, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                report["bez_zmian"].append(name)
                continue
            validate(new, old, slug)
            changes = diff(old, new)
            new["sprawdzono"] = TODAY
            path.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            all_changes = changes + [f"(opis AI) {n}" for n in notes if n not in changes]
            if all_changes:
                entry["operatorzy"].append({"operator": name, "zmiany": all_changes})
                report["operatorzy"].append({"operator": name, "zmiany": all_changes,
                                             "do_sprawdzenia": new.get("do_sprawdzenia", [])[:10]})
            else:
                report["bez_zmian"].append(name)
        except Exception as e:  # jeden operator nie zatrzymuje reszty
            traceback.print_exc()
            report["bledy"].append(f"{name}: {e}")

    index["aktualizacja"] = TODAY
    (DATA / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cl_path = DATA / "changelog.json"
    cl = json.loads(cl_path.read_text(encoding="utf-8")) if cl_path.exists() else []
    if report["bledy"]:
        entry["bledy"] = report["bledy"]
    cl.insert(0, entry)
    cl_path.write_text(json.dumps(cl[:60], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    k = report["koszt"]
    # orientacyjnie wg cennika Sonnet 5.5: $2/MTok wejście, $10/MTok wyjście, $10/1000 wyszukań
    report["koszt"]["usd_orientacyjnie"] = round(k["input"] / 1e6 * 2 + k["output"] / 1e6 * 10 + k["searches"] / 1000 * 10, 2)
    lines = [f"Aktualizacja bazy TV: {TODAY}", ""]
    for o in report["operatorzy"]:
        lines.append(f"{o['operator']}:")
        lines += [f"  - {z}" for z in o["zmiany"]]
    if report["bez_zmian"]:
        lines.append("Bez zmian: " + ", ".join(report["bez_zmian"]))
    if report["bledy"]:
        lines.append("")
        lines.append("BŁĘDY (dane tych operatorów zostały bez zmian):")
        lines += [f"  - {b}" for b in report["bledy"]]
    lines += ["", f"Koszt orientacyjny: ~{report['koszt']['usd_orientacyjnie']} USD",
              "Apka: https://mojanetia-strona.github.io/teleranking-tv/"]
    report["tekst"] = "\n".join(lines)
    log(report["tekst"])
    try:
        send_report(report)
    except Exception as e:
        log(f"Nie udało się wysłać raportu: {e}")
    if report["bledy"] and len(report["bledy"]) == len(slugs):
        sys.exit(1)


if __name__ == "__main__":
    main()

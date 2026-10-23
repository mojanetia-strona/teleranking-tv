# Format pliku danych operatora: data/operators/<slug>.json

Jeden plik JSON na operatora. Wszystkie teksty po polsku. Bez cen (ceny są w ofertach na teleranking.pl).
Zasada nadrzędna: tylko fakty potwierdzone w oficjalnym źródle operatora (strona operatora, PDF z listą kanałów,
regulamin/cennik promocji). Czego nie da się potwierdzić, NIE wpisujemy jako faktu, tylko dodajemy do "do_sprawdzenia".
Każdy pakiet, dodatek i sekcja ma pole "zrodla" z identyfikatorami źródeł z listy "zrodla" na górze pliku.

```json
{
  "operator": "Netia",
  "slug": "netia",
  "sprawdzono": "2026-10-23",
  "zrodla": [
    {"id": "s1", "tytul": "Lista kanałów Netia TV (PDF)", "url": "https://...", "typ": "pdf|strona|regulamin", "sprawdzono": "2026-10-23"}
  ],
  "podsumowanie": "2-4 zdania: jak operator sprzedaje TV (np. tylko z internetem, technologia, struktura pakietów S/M/L).",
  "technologie": [
    {"nazwa": "IPTV | DVB-C (kablówka) | OTT (aplikacja) | satelita", "opis": "gdzie/kiedy dostępna", "zrodla": ["s1"]}
  ],
  "pakiety": [
    {
      "id": "netia-m",
      "nazwa": "Pakiet M",
      "rodzaj": "podstawowy | rozszerzony | tematyczny | premium",
      "liczba_kanalow": 120,
      "liczba_kanalow_hd": 80,
      "zawiera_pakiet": "netia-s",
      "opis": "co to jest, dla kogo",
      "warunki": "np. dostępny tylko z internetem / tylko w technologii X",
      "zrodla": ["s1"]
    }
  ],
  "kanaly": [
    {
      "nazwa": "TVN",
      "kategoria": "ogólne | informacyjne | sportowe | filmy i seriale | dla dzieci | dokumentalne | lifestyle | muzyczne | regionalne | zagraniczne | dla dorosłych | inne",
      "jakosc": "SD | HD | 4K",
      "pakiety": ["netia-s", "netia-m", "netia-l"],
      "uwagi": ""
    }
  ],
  "dodatki": [
    {
      "id": "netia-canalplus",
      "nazwa": "Canal+ Prestige",
      "rodzaj": "premium | sport | filmowy | dziecięcy | erotyczny | inny",
      "zawartosc": "jakie kanały / co daje",
      "kanaly": ["CANAL+ Premium", "..."],
      "warunki": "np. wymaga pakietu M",
      "zrodla": ["s2"]
    }
  ],
  "streaming": [
    {
      "serwis": "Netflix | Max | Disney+ | Canal+ online | Polsat Box Go | SkyShowtime | Player | Amazon Prime Video | Eleven Sports | Viaplay | inny",
      "dostepnosc": "w cenie pakietu X | jako płatny dodatek | integracja w dekoderze (logowanie własnym kontem) | brak",
      "opis": "",
      "zrodla": ["s3"]
    }
  ],
  "multiroom": {
    "dostepny": true,
    "max_odbiornikow": 3,
    "jak_dziala": "drugi dekoder / aplikacja na kolejnym TV / ...",
    "co_na_kolejnych_tv": "te same kanały co na głównym? ograniczenia?",
    "uwagi": "",
    "zrodla": ["s4"]
  },
  "sprzet_i_funkcje": {
    "dekodery": [{"nazwa": "", "opis": "4K, Android TV, nagrywarka itp."}],
    "aplikacja": {"nazwa": "", "urzadzenia": "telefon, tablet, Smart TV, przeglądarka...", "ile_urzadzen_jednoczesnie": "", "uwagi": ""},
    "smart_tv_bez_dekodera": "czy da się oglądać bez dekodera, na jakich telewizorach",
    "nagrywanie": "nPVR / nagrywanie na dysku / brak, limity",
    "cofanie_i_ogladanie_od_poczatku": "catch-up, timeshift, start-over, ile dni wstecz",
    "vod": "biblioteka VOD w pakiecie",
    "zrodla": ["s5"]
  },
  "warunki_ogolne": [
    "krótkie, konkretne fakty, np. 'TV sprzedawana tylko łącznie z internetem'"
  ],
  "faq": [
    {"pytanie": "Czy mogę oglądać na dwóch telewizorach?", "odpowiedz": "konkretna odpowiedź", "zrodla": ["s4"]}
  ],
  "do_sprawdzenia": [
    "rzeczy, których nie udało się potwierdzić w oficjalnych źródłach, z krótkim opisem"
  ]
}
```

Uwagi:
- "pakiety" w "kanaly": wypisz WSZYSTKIE pakiety, w których kanał jest dostępny (także wyższe, kumulatywne).
- Kanały dostępne tylko w dodatku (np. Canal+) wpisz do "kanaly" z "pakiety": [] i dodaj id dodatku w "uwagi" w formie "dodatek: <id>".
- Nazwy kanałów pisz tak jak operator, ale bez dopisku HD w nazwie (jakość w polu "jakosc").
- Jeśli lista kanałów różni się regionalnie lub między technologiami, opisz to w "uwagi" pakietu/kanału i w "warunki_ogolne".
- FAQ: 10-20 pytań, które klient realnie zadaje handlowcowi przez telefon (multiroom, aplikacja, Smart TV, sport, Canal+, Netflix, nagrywanie, dekoder, czy TV bez internetu itp.).

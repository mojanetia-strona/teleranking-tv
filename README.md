# TeleRanking TV - baza wiedzy

Wewnętrzne narzędzie teleranking.pl: kanały, pakiety, dodatki, streamingi, multiroom i odpowiedzi na pytania klientów o telewizję u operatorów (Netia, T-Mobile, Orange, Play, Plus, Vectra, INEA).

Apka: https://kanaly.teleranking.pl/

## Jak to działa

1. **Co poniedziałek rano** GitHub Actions (`.github/workflows/aktualizacja.yml`) uruchamia `scripts/update.py`.
2. Skrypt dla każdego operatora wysyła obecne dane do Claude API. Claude sam czyta oficjalne strony i PDF-y operatora i zwraca `BEZ_ZMIAN` albo poprawione dane.
3. Skrypt sprawdza wynik (bezpieczniki: np. odrzuca dane, jeśli nagle zniknęło 40% kanałów), liczy różnice i zapisuje do `data/`.
4. Zmiany trafiają do `data/changelog.json` (zakładka "Zmiany" w apce), a raport idzie do Make (scenariusz "Teleranking TV: raport cotygodniowej aktualizacji (mail)") i dalej mailem.
5. GitHub Pages sam odświeża apkę po zapisie.

## Sekrety repo (Settings → Secrets and variables → Actions)

- `ANTHROPIC_API_KEY` - klucz z https://console.anthropic.com/settings/keys
- `MAKE_WEBHOOK_URL` - adres webhooka Make do raportu mailowego

## Ręczne uruchomienie

Actions → "Cotygodniowa aktualizacja bazy TV" → Run workflow. W polu "only" można podać wybranych operatorów, np. `netia,vectra`.

## Zasady danych

- Tylko oficjalne źródła operatorów, przy każdej informacji link do źródła.
- Bez cen (ceny są w ofertach na teleranking.pl).
- Czego nie da się potwierdzić, trafia do sekcji "Do sprawdzenia".
- Żadnych materiałów partnerskich (np. Learn2Sell) - repo jest publiczne.

Format danych: `schema/operator.schema.md`.

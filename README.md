# Biblia Ortodoxă — Căutare Avansată

API REST + SPA pentru Biblia Ortodoxă cu căutare full-text, calendar liturgic și sinaxar.

## Endpoints API

- `GET /api/books` — Listă cărți
- `GET /api/books/:id` — Detalii carte + capitole
- `GET /api/books/:bookId/chapters/:chapter` — Versetele unui capitol
- `GET /api/search?q=...` — Căutare full-text în Biblie
- `GET /api/search/suggest?q=...` — Autocomplete
- `GET /api/reference?q=...` — Rezolvă referințe (ex. "Ioan 1:1")
- `GET /api/calendar/:an/:luna` — Calendar liturgic
- `GET /api/sinaxar/:an/:luna/:zi` — Sinaxar
- `POST /api/analytics/login` — Login analytics
- `GET /api/analytics/stats?range=7d` — Statistici vizualizări

## Dashboard Analytics

- URL: `/analytics`
- Parolă: setată via `ANALYTICS_PASSWORD` env var

Urmărește geolocația vizitatorilor, pagini populare și trend zilnic. Zero dependențe externe (Leaflet + Canvas).

## Development

```bash
npm start
```

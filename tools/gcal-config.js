// ─────────────────────────────────────────────────────────────────
// SPOLOČNÝ GOOGLE KALENDÁR ODDELENIA – jedno miesto pre celú appku.
// Zobrazuje sa v Oznamoch (rozvrh) a na stránke /tools/kalendar/.
//
// Ako získať adresu:
//   1. calendar.google.com → ⚙️ Nastavenia → váš zdieľaný kalendár
//   2. „Prístupové povolenia" → zapnúť „Sprístupniť verejne"
//      (kalendár obsahuje len podujatia/dovolenky – žiadne pacientske dáta)
//   3. „Integrovať kalendár" → „Vložiť kód" → skopírovať z iframe
//      hodnotu src, napr.:
//      https://calendar.google.com/calendar/embed?src=abc123%40group.calendar.google.com
//   4. Vložiť ju nižšie medzi úvodzovky.
// ─────────────────────────────────────────────────────────────────
window.GCAL_EMBED = '';

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
window.GCAL_EMBED = ''; // neverejný kalendár – udalosti sa synchronizujú cez tajnú iCal adresu (GitHub secret GCAL_ICS_URL)

// ─────────────────────────────────────────────────────────────────
// EDITOVANIE KALENDÁRA PRIAMO V APPKE (voliteľné, jednorazové nastavenie)
// Bez vyplnenia funguje kalendár na čítanie + tlačidlo „Pridať cez
// Google" (otvorí Google kalendár s predvyplnenou udalosťou).
//
// Ako zapnúť plné editovanie (pridať/upraviť/zmazať priamo v appke):
//   1. console.cloud.google.com → vytvoriť projekt (napr. „cievny-kalendar")
//   2. APIs & Services → Library → zapnúť „Google Calendar API"
//   3. OAuth consent screen → External → vyplniť názov; do Test users
//      pridať Google účty lekárov (alebo Publish app)
//   4. Credentials → Create credentials → OAuth client ID → Web application
//      → Authorized JavaScript origins: https://cievny.sk a https://www.cievny.sk
//      → skopírovať Client ID sem:
window.GCAL_CLIENT_ID = '';   // napr. 1234567890-abc.apps.googleusercontent.com
//   5. ID kalendára: calendar.google.com → ⚙️ nastavenia kalendára →
//      „Integrovať kalendár" → Calendar ID:
window.GCAL_CALENDAR_ID = ''; // napr. abc123@group.calendar.google.com
//   6. Každý lekár musí mať kalendár nazdieľaný s právom
//      „Vykonávať zmeny v udalostiach" na svoj Google účet.

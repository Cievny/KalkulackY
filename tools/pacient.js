// v2 · Pacient ako entita – klientský helper.
// Zavolá RPC najdi_alebo_zaloz_pacienta(RČ) a vráti pacient_id (UUID) alebo
// null. Best-effort: pri chybe/chýbajúcej RPC vráti null, aby uloženie nálezu
// nikdy nezlyhalo kvôli párovaniu pacienta. RČ NEODCHÁDZA nikam inam ako do
// vlastnej Supabase RPC (server ho zahashuje a uloží do chráneného trezora).
(function (global) {
  'use strict';
  function pacientId(sbUrl, headers, rc, rocnik, pohlavie) {
    var clean = String(rc == null ? '' : rc).replace(/\D/g, '');
    if (clean.length < 6) return Promise.resolve(null);
    return fetch(sbUrl + '/rest/v1/rpc/najdi_alebo_zaloz_pacienta', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({ p_rc: clean, p_rocnik: rocnik || null, p_pohlavie: pohlavie || null })
    }).then(function (r) {
      if (!r.ok) return null;
      return r.json().then(function (v) {
        // PostgREST vracia skalár priamo (uuid string), príp. v poli
        if (typeof v === 'string') return v || null;
        if (Array.isArray(v) && v.length) return v[0] || null;
        return v || null;
      }).catch(function () { return null; });
    }).catch(function () { return null; });
  }
  var API = { id: pacientId };
  global.Pacient = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

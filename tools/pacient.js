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
  // v2: RČ a/alebo Pacient ID → {id, cislo} | {error} | null.
  // Bez oboch založí anonymného pacienta s novým číslom. Ak RPC v2 v DB
  // ešte nie je (404), spadne na starú RPC podľa RČ – uloženie nikdy nezlyhá.
  function paruj(sbUrl, headers, rc, cislo, rocnik, pohlavie) {
    var clean = String(rc == null ? '' : rc).replace(/\D/g, '');
    if (clean.length < 6) clean = '';
    var c = parseInt(String(cislo == null ? '' : cislo).replace(/\D/g, ''), 10);
    if (!(c > 0)) c = null;
    return fetch(sbUrl + '/rest/v1/rpc/najdi_alebo_zaloz_pacienta_v2', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({ p_rc: clean || null, p_cislo: c, p_rocnik: rocnik || null, p_pohlavie: pohlavie || null })
    }).then(function (r) {
      if (r.status === 404) {
        // stará DB bez v2 – páruj aspoň podľa RČ ako doteraz
        return pacientId(sbUrl, headers, clean, rocnik, pohlavie)
          .then(function (id) { return id ? { id: id, cislo: null } : null; });
      }
      if (!r.ok) return null;
      return r.json().then(function (v) {
        if (Array.isArray(v)) v = v[0];
        if (v && v.error) return { error: v.error };
        if (v && v.id) return v;
        return null;
      }).catch(function () { return null; });
    }).catch(function () { return null; });
  }
  // dohľadá krátke číslo pacienta podľa uuid (na zobrazenie pri úprave záznamu)
  function cisloPodlaId(sbUrl, headers, pacientId) {
    if (!pacientId) return Promise.resolve(null);
    return fetch(sbUrl + '/rest/v1/pacienti?id=eq.' + encodeURIComponent(pacientId) + '&select=cislo', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return rows && rows[0] ? rows[0].cislo : null; })
      .catch(function () { return null; });
  }
  var API = { id: pacientId, paruj: paruj, cislo: cisloPodlaId };
  global.Pacient = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

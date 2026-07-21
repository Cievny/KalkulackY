// Supabase Edge Function „extrakcia" – bezpečný most k cloud LLM.
// Frontend PRED odoslaním text lokálne očistí (tools/scrub.js) a ukáže
// používateľovi náhľad. Táto funkcia:
//   1) pustí len prihláseného používateľa (overí Supabase JWT),
//   2) POISTKA (fail-closed): keby v texte predsa zostal identifikátor
//      (RČ, e-mail, telefón), požiadavku ODMIETNE – von nič neodíde,
//   3) očistený klinický text pošle do Anthropic API a vráti štruktúru polí.
//
// Kľúč pacienta (RČ, meno) sem NIKDY nechodí – ten spracúva appka lokálne.
//
// Nasadenie (spustí správca raz):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (od Anthropic, s DPA/zero-retention)
//   supabase functions deploy extrakcia
//
// Voliteľné tajomstvo:  EXTRAKCIA_MODEL  (default claude-haiku-4-5-20251001)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// serverová poistka – vzory, ktoré v očistenom texte NESMÚ byť
const ZAKAZANE: [RegExp, string][] = [
  [/\b\d{6}\s*\/\s*\d{3,4}\b/, 'rodné číslo'],
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, 'e-mail'],
  [/(?:\+421|00421|0)\s?\d{2,3}[\s/]?\d{3}[\s/]?\d{2,3}\b/, 'telefón'],
];

const SCHEMA = {
  type: 'object',
  properties: {
    diagnoza: { type: 'string', description: 'napr. AAA infrarenálna, TAAA, Endoleak po EVAR, Disekcia typ B' },
    endoleak_typ: { type: 'string', enum: ['Ia', 'Ib', 'II', 'III', 'IV', 'V'] },
    symptomy: { type: 'string', enum: ['asymptomatický', 'symptomatický', 'ruptúra'] },
    priemer_mm: { type: 'number', description: 'max. priemer vaku v mm' },
    rast_mm_rok: { type: 'number' },
    krcok_dlzka_mm: { type: 'number' },
    krcok_priemer_mm: { type: 'number' },
    krcok_angulacia: { type: 'string', enum: ['<60', '>60'] },
    aic_dx_mm: { type: 'number' }, aic_sin_mm: { type: 'number' },
    aie_dx_mm: { type: 'number' }, aie_sin_mm: { type: 'number' },
    renalne: { type: 'string', description: 'eGFR alebo kreatinín ako text' },
    medikacia: { type: 'string', description: 'antitrombotiká: ASA, klopidogrel, NOAK…' },
    urgencia: { type: 'string', enum: ['urgentné', 'emergentné'] },
    vykon: { type: 'string', description: 'navrhovaný výkon: EVAR, FEVAR, BEVAR, TEVAR, embolizácia' },
    zdroje: {
      type: 'object',
      description: 'ku každému vyplnenému poľu krátky doslovný citát zo vstupu (kľúč = názov poľa)',
      additionalProperties: { type: 'string' },
    },
  },
  additionalProperties: false,
};

const SYSTEM = `Si asistent cievneho chirurga. Z očisteného klinického textu (žiadanka, CT popis) vytiahni len polia definované nástrojom.
Pravidlá:
- Vyplň LEN to, čo je v texte jednoznačne uvedené. Nič nedomýšľaj ani neodhaduj – radšej pole vynechaj.
- Text je zbavený osobných údajov (zástupky [MENO], [RČ], [DÁTUM]…). Tie ignoruj.
- Ku každému vyplnenému poľu daj do "zdroje" krátky doslovný citát z textu, na základe ktorého si ho určil.
- Priemery a dĺžky sú čísla v mm. Rozmery aorty typicky 20–120 mm.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    if (req.method !== 'POST') return json({ error: 'len POST' }, 405);

    // 1) len prihlásený používateľ (Supabase posiela JWT v Authorization)
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ') || auth.length < 30) return json({ error: 'neprihlásený' }, 401);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'AI nie je nastavené (chýba ANTHROPIC_API_KEY)' }, 503);

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    if (!text) return json({ error: 'prázdny text' }, 400);
    if (text.length > 8000) return json({ error: 'text príliš dlhý' }, 413);

    // 2) POISTKA: identifikátor v „očistenom" texte → odmietnuť, von nič nepošleme
    for (const [re, meno] of ZAKAZANE) {
      if (re.test(text)) return json({ error: 'V texte zostal identifikátor (' + meno + '). Odosielanie zrušené – najprv ho odstráňte.' }, 422);
    }

    // 3) cloud LLM cez tool-use (spoľahlivé štruktúrované JSON)
    const model = Deno.env.get('EXTRAKCIA_MODEL') || 'claude-haiku-4-5-20251001';
    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 1024, system: SYSTEM,
        tools: [{ name: 'poziadavka', description: 'Vyplnené polia požiadavky', input_schema: SCHEMA }],
        tool_choice: { type: 'tool', name: 'poziadavka' },
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!ar.ok) {
      const t = await ar.text().catch(() => '');
      return json({ error: 'chyba LLM (' + ar.status + ')', detail: t.slice(0, 300) }, 502);
    }
    const data = await ar.json();
    const block = (data?.content || []).find((c: { type: string }) => c.type === 'tool_use');
    return json({ fields: block?.input || {} });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

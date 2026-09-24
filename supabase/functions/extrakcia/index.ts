// Supabase Edge Function „extrakcia" – bezpečný most k cloud LLM.
// Frontend PRED odoslaním text lokálne očistí (tools/scrub.js) a ukáže
// používateľovi náhľad. Táto funkcia:
//   1) pustí len prihláseného používateľa (overí Supabase JWT),
//   2) POISTKA (fail-closed): keby v texte predsa zostal identifikátor
//      (RČ, e-mail, telefón), požiadavku ODMIETNE – von nič neodíde,
//   3) očistený klinický text pošle do Anthropic API a vráti štruktúru polí.
//
// Druhy extrakcie (body.kind):
//   'poziadavka' (predvolené) – žiadanka / CT popis → polia požiadavky (Aorta)
//   'evk'                     – heslovitý diktát výkonu → polia EVK formulára
//
// Kľúč pacienta (RČ, meno) sem NIKDY nechodí – ten spracúva appka lokálne.
//
// Nasadenie (spustí správca raz):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (od Anthropic, s DPA/zero-retention)
//   supabase functions deploy extrakcia
//
// Voliteľné tajomstvo:  EXTRAKCIA_MODEL  (default claude-haiku-4-5-20251001;
//                       pre diktovanie odporúčané claude-sonnet-5)

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

/* ───────────── 1) POŽIADAVKA (žiadanka / CT popis) ───────────── */
const SCHEMA_POZIADAVKA = {
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

const SYSTEM_POZIADAVKA = `Si asistent cievneho chirurga. Z očisteného klinického textu (žiadanka, CT popis) vytiahni len polia definované nástrojom.
Pravidlá:
- Vyplň LEN to, čo je v texte jednoznačne uvedené. Nič nedomýšľaj ani neodhaduj – radšej pole vynechaj.
- Text je zbavený osobných údajov (zástupky [MENO], [RČ], [DÁTUM]…). Tie ignoruj.
- Ku každému vyplnenému poľu daj do "zdroje" krátky doslovný citát z textu, na základe ktorého si ho určil.
- Priemery a dĺžky sú čísla v mm. Rozmery aorty typicky 20–120 mm.`;

/* ───────────── 2) EVK – heslovitý diktát endovaskulárneho výkonu ───────────── */
const TEPNA = ['Aorta', 'AIC', 'AIE', 'AII', 'AFC', 'APF', 'AFS', 'P1', 'P2', 'P3', 'ATA', 'ATP', 'AFib', 'TTF'];
const STRANA = ['l.sin.', 'l.dx.'];
const SEGMENT = ['proximálny', 'stredný', 'distálny', 'celý', 'odstup'];
const DSA_NALEZ = ['bez závažnej stenózy', 'stenóza do 50%', 'stenóza 50–70%', 'stenóza 70–90%', 'kritická stenóza >90%',
  'oklúzia', 'stav po PVI', 'stav po stentingu', 'in-stent restenóza', 'oklúzia stentu', 'stav po bypasse',
  'stav po profundoplastike', 'stav po TEA', 'disekcia', 'aneuryzmatické zmeny', 'hypoplastická/aplastická', 'vlastný popis'];

const LOKALITA = {
  type: 'object',
  properties: {
    tepna: { type: 'string', enum: TEPNA },
    strana: { type: 'string', enum: STRANA },
    segment: { type: 'string', enum: SEGMENT },
  },
  required: ['tepna'],
  additionalProperties: false,
};

const STENT_KUS = {
  type: 'object',
  properties: {
    typ: { type: 'string', enum: ['balónexpandibilný', 'samoexpandibilný', 'liekový (DES)'] },
    nazov: { type: 'string' }, priemer_mm: { type: 'number' }, dlzka_mm: { type: 'number' },
  },
  additionalProperties: false,
};

const SCHEMA_EVK = {
  type: 'object',
  properties: {
    riecisko: { type: 'string', enum: ['fem', 'pelv', 'both'], description: 'fem = femoropopliteálne + predkolenie, pelv = panvové (aortoiliakálne), both = oboje' },
    pristup: {
      type: 'object',
      properties: {
        arteria: { type: 'string', description: 'AFC | a. brachialis | a. axillaris | iná (napíš názov)' },
        strana: { type: 'string', enum: STRANA },
        technika: { type: 'string', enum: ['prográdne', 'retrográdne'] },
        smer: { type: 'string', enum: ['ipsilaterálna', 'kontralaterálna'], description: 'len pri AFC: ipsilaterálna = tá istá strana ako liečená končatina' },
        sposob: { type: 'string', enum: ['perkutánne', 'chirurgický cut-down'] },
        anestezia: { type: 'string', enum: ['LA', 'SA', 'GA'] },
        navigacia: { type: 'string', enum: ['USG', 'XA', 'USG/XA'] },
        sheath_fr: { type: 'number', description: 'veľkosť zavádzača vo French (4–8)' },
        sheath_dlzka_cm: { type: 'number' },
        kateter: { type: 'string', description: 'diagnostický katéter: Berenstein, JR 4, Cobra, SOS, Vertebrál, Pigtail…' },
      },
      additionalProperties: false,
    },
    dalsi_pristup: {
      type: 'object',
      properties: {
        arteria: { type: 'string' }, strana: { type: 'string', enum: STRANA },
        technika: { type: 'string', enum: ['prográdne', 'retrográdne'] },
        sheath_fr: { type: 'number' }, uzaver: { type: 'string' }, poznamka: { type: 'string' },
      },
      additionalProperties: false,
    },
    heparin_iu: { type: 'number' },
    kontrast: { type: 'array', items: { type: 'string', enum: ['Scanlux 370', 'Iomeron 350', 'Ultravist 300', 'CO2'] } },
    dsa: {
      type: 'array',
      description: 'DSA nález po tepnách – LEN tepny, ktoré diktát výslovne spomína',
      items: {
        type: 'object',
        properties: {
          tepna: { type: 'string', enum: TEPNA },
          strana: { type: 'string', enum: STRANA },
          nalez: { type: 'string', enum: DSA_NALEZ },
          segment: { type: 'string', enum: SEGMENT, description: 'vyplň, ak je nález viazaný na úsek tepny' },
          popis: { type: 'string', description: 'voľný text, ak nález nesedí do enumu (nalez = "vlastný popis")' },
        },
        required: ['tepna', 'nalez'],
        additionalProperties: false,
      },
    },
    vymena_sheathu: {
      type: 'object', description: 'výmena sheathu pre intervenciu',
      properties: { fr: { type: 'number' }, dlzka_cm: { type: 'number' }, znacka: { type: 'string' } },
      additionalProperties: false,
    },
    prechod: { type: 'array', items: { type: 'string', enum: ['intraluminálne', 'subintimálne', 'kombinovane intra aj subintimálne'] } },
    vodic: { type: 'string', description: 'napr. Advantage 0.014", Command 0.018", ZIP, J vodič 0.035"' },
    podporny_kateter: { type: 'string', description: 'NaviCross, Berenstein, CXI, Rubicon…' },
    intervencie: {
      type: 'array',
      description: 'každý použitý device / výkon ako samostatná položka, v poradí ako boli vykonané',
      items: {
        type: 'object',
        properties: {
          typ: { type: 'string', enum: ['vessel_prep', 'predilatacia', 'ivl', 'pta', 'deb', 'stent', 'postdilatacia', 'stentgraft', 'trombektomia', 'aterektomia', 'reentry'],
            description: 'vessel_prep = cutting/scoring balón; predilatacia = balón pred stentom; ivl = litotripsia; pta = obyčajný balón; deb = liekový balón; postdilatacia = balón po stente' },
          tepna: { type: 'string', enum: TEPNA },
          strana: { type: 'string', enum: STRANA },
          segment: { type: 'string', enum: SEGMENT },
          device: { type: 'string', description: 'názov balóna / stentu / katétra presne ako bol povedaný' },
          priemer_mm: { type: 'number' }, dlzka_mm: { type: 'number' },
          tlak_atm: { type: 'number' }, inflacia_min: { type: 'number' },
          pulzy: { type: 'number', description: 'počet pulzov pri IVL' },
          stent_typ: { type: 'string', enum: ['balónexpandibilný', 'samoexpandibilný', 'liekový (DES)'] },
          dlzka_lezie_mm: { type: 'number' },
          kalcifikacia: { type: 'string', enum: ['žiadna', 'stredná', 'ťažká'] },
          cto: { type: 'boolean', description: 'chronický totálny uzáver' },
          cto_dlzka_mm: { type: 'number' },
          metoda: { type: 'string', enum: ['Rotarex', 'aspiračná'], description: 'len pri trombektómii' },
          velkost_fr: { type: 'number', description: 'French katétra pri trombektómii' },
          atek_typ: { type: 'string', enum: ['orbitálna', 'laserová'], description: 'len pri aterektómii' },
          emboloprotekcia: { type: 'string', description: 'filter pri aterektómii: Spider FX, FilterWire EZ, Emboshield NAV6' },
          dalsie_tepny: { type: 'array', items: LOKALITA, description: 'ten istý device použitý aj v ďalších tepnách / segmentoch' },
        },
        required: ['typ'],
        additionalProperties: false,
      },
    },
    kissing: {
      type: 'object', description: 'kissing stent technika v AIC (len panva)',
      properties: { stent_sin: STENT_KUS, stent_dx: STENT_KUS },
      additionalProperties: false,
    },
    cerab: {
      type: 'object', description: 'CERAB technika (aortálny cuff + kissing stenty AIC)',
      properties: { cuff: STENT_KUS, sin: STENT_KUS, dx: STENT_KUS },
      additionalProperties: false,
    },
    bez_intervencie: { type: 'object', properties: { dovod: { type: 'string' } }, additionalProperties: false },
    dalsie_osetrenie: {
      type: 'object', description: 'ďalšie nevyhnutné ošetrenie pre komplikáciu počas výkonu',
      properties: {
        dovod: { type: 'array', items: { type: 'string', enum: ['prietok limitujúca disekcia', 'perforácia', 'extravazát', 'reziduálne stenózy', 'spazmus', 'recoil', 'trombóza', 'distálna embolizácia'] } },
        technika: { type: 'array', items: { type: 'string', enum: ['prolongovaná dilatácia', 'stenting', 'trombektómia', 'nutné chirurgické ošetrenie'] } },
        poznamka: { type: 'string' },
      },
      additionalProperties: false,
    },
    uzaver: {
      type: 'object',
      properties: {
        kompresia_min: { type: 'number' },
        zariadenie: { type: 'string', description: 'manuálna kompresia | AngioSeal 6F | AngioSeal 8F | FemoSeal | ProStyle | MynxControl | iné' },
        hemostaza: { type: 'string', enum: ['ihneď', 'po manuálnej kompresii', 'za použitia PatchPro bandáže'] },
        femostop: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    technicky_uspech: { type: 'string', enum: ['Technický úspech', 'Parciálny úspech', 'Technický neúspech'] },
    komplikacie: { type: 'array', items: { type: 'string', enum: ['žiadne', 'hematóm', 'pseudoaneuryzma', 'perforácia', 'distálna embólia', 'flow-limitujúca disekcia', 'technicky neúspešná intervencia', 'chirurgická konverzia', 'exitus', 'iné'] } },
    komplikacie_text: { type: 'string' },
    studia: {
      type: 'object',
      properties: { dlzka_min: { type: 'number' }, skia_min: { type: 'number' }, dap: { type: 'number' }, kontrast_ml: { type: 'number' } },
      additionalProperties: false,
    },
    zaver: { type: 'string', description: 'odporúčanie / záver, ak bol nadiktovaný (liečba, kontrola)' },
    nezaradene: {
      type: 'array', items: { type: 'string' },
      description: 'DOSLOVNÉ útržky diktátu, ktoré sa nedali priradiť k žiadnemu poľu – aby sa nič nestratilo',
    },
  },
  additionalProperties: false,
};

const SYSTEM_EVK = `Si asistent cievneho chirurga na angiografickej sále. Dostaneš HESLOVITÝ DIKTÁT endovaskulárneho výkonu na tepnách dolných končatín (nie príbeh – krátke heslá v poradí, ako lekár výkon robil). Preveď ho do polí nástroja "evk_nalez".

ZÁKLADNÉ PRAVIDLÁ
- Vyplň LEN to, čo diktát výslovne obsahuje. Nič nedomýšľaj: ak nie je povedaná anestézia, sheath, uzáver či komplikácie, pole vynechaj. Nevymýšľaj DSA nálezy pre tepny, ktoré neboli spomenuté.
- Každý útržok, ktorý nevieš zaradiť, daj DOSLOVNE do "nezaradene" – nič sa nesmie potichu stratiť.
- Text je zbavený osobných údajov (zástupky [MENO], [RČ]…). Ignoruj ich.

SKRATKY TEPIEN (vždy použi presne tieto kódy)
AIC = a. iliaca communis, AIE = a. iliaca externa, AII = a. iliaca interna, AFC = a. femoralis communis, APF = a. profunda femoris, AFS = a. femoralis superficialis, P1/P2/P3 = a. poplitea (nad kolenom / za kolenom / pod kolenom), ATA = a. tibialis anterior, ATP = a. tibialis posterior, AFib = a. fibularis (peronea), TTF = truncus tibiofibularis.
Panvové tepny (AIC/AIE/AII/Aorta) → riecisko "pelv"; femorálne/popliteálne/krurálne → "fem"; oboje → "both".

STRANA A SEGMENT
"vľavo/ľavá/sin/l.sin." → "l.sin.", "vpravo/pravá/dx/l.dx." → "l.dx.". "prox/proximálne" → "proximálny", "stred" → "stredný", "dist" → "distálny", "celá/celý priebeh" → "celý", "odstup/ostium" → "odstup".
Ak lekár povie stranu raz na začiatku (napr. "ľavá noha"), platí pre všetky tepny končatiny, kým nepovie inak.

ROZMERY
"5x80", "5 krát 80", "päť krát osemdesiat" → priemer_mm 5, dlzka_mm 80. "6F", "šesť french" → 6. Balóny majú priemer 2–12 mm, stenty 4–14 mm, dĺžky 20–300 mm.

INTERVENCIE
Každý balón / stent / katéter = jedna položka "intervencie" v poradí diktátu. Typy: "predilatácia" pred stentom → predilatacia; "postdilatácia" po stente → postdilatacia; "PTA/POBA/obyčajný balón" → pta; "DEB/liekový balón/DCB" → deb; "cutting/scoring/Chocolate/AngioSculpt" → vessel_prep; "IVL/Shockwave/litotripsia" → ivl; "Rotarex/aspirácia/trombektómia/Indigo" → trombektomia (metoda Rotarex alebo aspiračná); "aterektómia/Stealth/Turbo-Elite" → aterektomia; "reentry/OutBack/OSCAR/Wingman/BeBack" → reentry; "stentgraft/Viabahn/BeGraft/Covera" → stentgraft.
Ak ten istý balón / stent / katéter použil vo viacerých tepnách alebo segmentoch, daj prvú do tepna/segment a ostatné do "dalsie_tepny" (nevytváraj duplicitné položky).
Názvy devices píš tak, ako boli povedané, s opravou zjavných preklepov prepisu (mustang → Mustang, pulzar → Pulsar). Známe názvy: balóny Jade, Armada, Passeo, CrossTella, Mustang; DEB MagicTouch, Elutax, Selution SLR, IN.PACT, Ranger, Luminor; vessel prep Chocolate, Cutting balloon, AngioSculpt, Spur, Wolverine; IVL Shockwave, Shockfast; stenty AbsolutePro, Pulsar, Astron, BioMimics, Supera, Eluvia, Nitides, Dynetic, Isthmus; stentgrafty BeGraft, Viabahn, Fluency, Covera; aspiračné katétre Indigo, Sofia, BigLumen, Lightning; vodiče Advantage 0.014"/0.018", Command 0.014"/0.018", ZIP, J vodič 0.035"; podporné katétre NaviCross, Berenstein, CXI, Rubicon; uzávery AngioSeal 6F/8F, FemoSeal, ProStyle, MynxControl.
Pri stente urči stent_typ len ak je povedaný (samoexpandibilný / balónexpandibilný / DES); Supera, Pulsar, AbsolutePro, Astron, BioMimics sú samoexpandibilné; Eluvia je DES; Dynetic, Isthmus, BeGraft sú balónexpandibilné.

OSTATNÉ
- "bez komplikácií" → komplikacie ["žiadne"]. "technický úspech" → technicky_uspech "Technický úspech".
- "kontrast 80" → studia.kontrast_ml 80; "skiaskopia 12 minút" → studia.skia_min; "DAP 85" → studia.dap.
- "heparín 5000" → heparin_iu 5000. "Scanlux/Iomeron/Ultravist/CO2" → kontrast.
- Záver/odporúčanie (DAPT, kontrola o 3 mesiace…) → zaver ako súvislá veta.`;

const KINDS: Record<string, { schema: unknown; system: string; tool: string; max: number }> = {
  poziadavka: { schema: SCHEMA_POZIADAVKA, system: SYSTEM_POZIADAVKA, tool: 'poziadavka', max: 1024 },
  evk: { schema: SCHEMA_EVK, system: SYSTEM_EVK, tool: 'evk_nalez', max: 4096 },
};

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
    if (text.length > 12000) return json({ error: 'text príliš dlhý' }, 413);
    const kind = KINDS[String(body?.kind || 'poziadavka')];
    if (!kind) return json({ error: 'neznámy druh extrakcie' }, 400);

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
        model, max_tokens: kind.max, system: kind.system,
        tools: [{ name: kind.tool, description: 'Štruktúrované polia z klinického textu', input_schema: kind.schema }],
        tool_choice: { type: 'tool', name: kind.tool },
        messages: [{ role: 'user', content: text }],
      }),
    });
    if (!ar.ok) {
      const t = await ar.text().catch(() => '');
      return json({ error: 'chyba LLM (' + ar.status + ')', detail: t.slice(0, 300) }, 502);
    }
    const data = await ar.json();
    const block = (data?.content || []).find((c: { type: string }) => c.type === 'tool_use');
    return json({ fields: block?.input || {}, model });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

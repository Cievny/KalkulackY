#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generátor NEZÁVISLEJ českej kópie appky (vlastná Supabase databáza, vlastné nasadenie).

Zo slovenských zdrojov (tools/…) vyrobí samostatný web v priečinku cz-app/, ktorý sa
nasadzuje ako SAMOSTATNÝ Vercel projekt (Root Directory = cz-app) a hovorí s VLASTNÝM
Supabase projektom. Nič nezdieľa so slovenskou prevádzkou – ani databázu, ani prihlásenie.

Zásady:
  • kópia je 1:1 – stránky sa NEPREPISUJÚ ručne, ale generujú odtiaľto; zmena v SK
    zdroji sa do kópie dostane opätovným spustením (CI kontroluje, že kópia je aktuálna)
  • všetko špecifické pre CZ inštanciu je v cz-app/config.json (URL a anon kľúč Supabase,
    názov), do generovaných súborov sa dosadí automaticky
  • rozsah sa riadi zoznamom TOOLS – zatiaľ len Požiadavky (ďalšie nástroje sa pridajú
    doplnením do zoznamu)

Použitie:
  python3 scripts/build_cz_app.py           # vygeneruje cz-app/
  python3 scripts/build_cz_app.py --check   # len overí, že cz-app/ zodpovedá zdrojom (CI)
"""
import json, os, re, shutil, sys, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cz_preklad import preloz, zvysky   # slovník SK → CZ (scripts/cz_preklad.py)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'cz-app')
CFG = json.load(open(os.path.join(OUT, 'config.json'), encoding='utf-8'))

SK_URL = 'https://ncqtiicfqhaturjlfxcj.supabase.co'
SK_ANON = 'sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k'

# nástroje zahrnuté do kópie: cesta pod tools/ → popis karty na úvodnej stránke
TOOLS = [
    ('Aorta', '📥 Požiadavky na terapiu (Aorta + Iné)'),
    ('pristupy', '🔑 Prístupy (povolení používatelia)'),
]
# stránky bez karty na úvode (otvárajú sa z odkazu): cieľ pozývacieho linku
HIDDEN_TOOLS = ['pozvanka']
# zdieľané skripty, ktoré zahrnuté nástroje potrebujú
SHARED_JS = ['auth.js', 'scrub.js', 'poziadavky-import.js']
# položky navigácie, ktoré v kópii ostanú (ostatné nástroje v nej nie sú)
NAV_KEEP = ['/tools/', '/tools/Aorta/']

GENERATED = {}   # relatívna cesta → obsah (text alebo bytes)

# Farebná téma CZ inštancie: modrý „chrome" SK verzie (navigácia, nadpisy, hlavné
# tlačidlá, pozadie) → červený, aby sa na prvý pohľad odlíšila od slovenskej.
# Sémantické farby (stavy na nástenke, urgencia, varovania) ostávajú nedotknuté.
THEME = [
    ('#0f1e3d', '#5b0e1a'),   # navigácia – pozadie
    ('#1a2c52', '#7a1f2e'),   # navigácia – hover / aktívna položka menu
    ('#2a3f66', '#8c3545'),   # navigácia – rám rozbaľovacieho menu
    ('#8fa3c8', '#f1b8b8'),   # navigácia – neaktívny text
    ('#3b82f6', '#f87171'),   # navigácia – podčiarknutie aktívnej / focus
    ('#1e40af', '#991b1b'),   # hlavné tlačidlá
    ('#1737a0', '#7f1d1d'),   # hlavné tlačidlá – hover
    ('#1a2745', '#5b0e1a'),   # nadpisy
    ('#f0f2f7', '#fdf2f2'),   # pozadie stránky
    ('#f7f8f8', '#fdf2f2'),   # pozadie loginu
]
def theme(src, protect=()):
    """prefarbí text; úseky začínajúce reťazcom z `protect` (po najbližšie '];') ostanú pôvodné"""
    keep = []
    for marker in protect:
        i = src.find(marker)
        if i < 0: continue
        j = src.find('];', i) + 2
        keep.append(src[i:j]); src = src[:i] + ('\0KEEP%d\0' % (len(keep) - 1)) + src[j:]
    for a, b in THEME:
        src = src.replace(a, b)
    for k, seg in enumerate(keep):
        src = src.replace('\0KEEP%d\0' % k, seg)
    return src



def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def swap_supabase(src):
    """pevné SK hodnoty → čítanie z config.js (window.APP_CONFIG)"""
    src = src.replace("'" + SK_URL + "'", 'window.APP_CONFIG.SB_URL')
    src = src.replace("'" + SK_ANON + "'", 'window.APP_CONFIG.SB_ANON')
    assert SK_URL not in src and SK_ANON not in src, 'ostal odkaz na slovenský Supabase'
    return src


def add_config_script(html):
    """config.js sa musí načítať PRED auth.js"""
    return html.replace('<script src="/tools/auth.js"></script>',
                        '<script src="/tools/config.js"></script>\n<script src="/tools/auth.js"></script>')


def build_auth():
    s = swap_supabase(read('tools/auth.js'))
    # navigácia: len nástroje, ktoré kópia obsahuje
    m = re.search(r"  const NAV_LINKS=\[\n(.*?)\n  \];", s, re.S)
    assert m, 'NAV_LINKS sa nenašlo'
    keep = []
    for line in m.group(1).split('\n'):
        mm = re.match(r"\s*\{href:'([^']+)',label:'([^']+)'\},?", line)
        if mm and mm.group(1) in NAV_KEEP:
            keep.append("    {href:'%s',label:'%s'}," % (mm.group(1), mm.group(2)))
    s = s[:m.start(1)] + '\n'.join(keep) + s[m.end(1):]
    # po prihlásení domov na Požiadavky (EVK v kópii nie je)
    s = s.replace("'/tools/EVK/'", "'/tools/Aorta/'")
    # kiosk (TV/veľín) a service worker v kópii nie sú
    s = s.replace("navigator.serviceWorker.register('/sw.js')", "Promise.resolve()")
    s = s.replace('// Shared auth + navigation for cievny.sk tools',
                  '// Shared auth + navigation – NEZÁVISLÁ CZ KÓPIA (generované zo tools/auth.js, needitovať ručne)')
    s = s.replace("{href:'/tools/',label:'🏠'}", "{href:'/tools/',label:'🏠 CZ'}")
    return preloz(theme(s))


def build_login():
    s = read('tools/login/index.html')
    # e-mail + heslo aj Google (provider Google treba zapnúť v českom Supabase projekte – pozri README)
    s = s.replace('🫀 cievny.sk', '🫀 ' + CFG['APP_NAME'])
    s = s.replace('Klinické nástroje – prihlásenie', 'Klinické nástroje – prihlásenie (CZ)')
    s = add_config_script(s)
    return preloz(theme(s))


def build_tool(name):
    s = swap_supabase(read('tools/%s/index.html' % name))
    s = re.sub(r'<title>(.*?)</title>', lambda m: '<title>CZ – ' + m.group(1) + '</title>', s, count=1)
    s = s.replace('/tools/EVK/', '/tools/Aorta/')   # EVK v kópii (zatiaľ) nie je – domov sú Požiadavky
    if name == 'Aorta':
        # „Indikoval“ – slovenskí operatéri sem nepatria; kým nebude zoznam českých lekárov,
        # meno sa píše ručne (formToObj/objToForm čítajú .value, funguje aj s inputom)
        s, n = re.subn(r'<select id="af_(indikoval[12])">.*?</select>',
                       r'<input id="af_\1" type="text" placeholder="jméno lékaře" autocomplete="off">', s)
        assert n == 2, 'Indikoval: v SK zdroji sa nenašli 2 selecty (%d)' % n
    # stavy nástenky (STATUSES) majú vlastné farby s významom – tie sa neprefarbujú
    s = theme(add_config_script(s), protect=('const STATUSES=[',))
    return preloz(s)


def build_index():
    cards = '\n'.join('  <a class="card" href="/tools/%s/"><h3>%s</h3></a>' % (p, l) for p, l in TOOLS)
    return preloz("""<!doctype html><html lang="cs"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nástroje – %s</title>
<style>
 body{font-family:system-ui;max-width:1000px;margin:40px auto;padding:0 16px;background:#fdf2f2}
 h1{color:#5b0e1a}
 .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
 .card{border:1px solid #e5e7eb;border-radius:14px;padding:14px;text-decoration:none;color:#111}
 .card:hover{box-shadow:0 6px 18px rgba(0,0,0,.08);transform:translateY(-1px)}
</style>
<body>
<script src="/tools/config.js"></script>
<script src="/tools/auth.js"></script>
<script>checkAuth();</script>
<h1>Nástroje – %s</h1>
<div class="grid">
%s
</div>
</body></html>
""" % (CFG['APP_NAME'], CFG['APP_NAME'], cards))


def build_config_js():
    return ("// Nastavenie tejto inštancie – jediné miesto s údajmi o Supabase projekte.\n"
            "// Hodnoty sa berú z cz-app/config.json (generované, needitovať ručne).\n"
            "window.APP_CONFIG=%s;\n" % json.dumps({'SB_URL': CFG['SB_URL'], 'SB_ANON': CFG['SB_ANON'], 'APP_NAME': CFG['APP_NAME']}, ensure_ascii=False))


def build_brana():
    s = read('lib/brana.mjs')
    s = s.replace("export const SB_URL_DEFAULT = '%s';" % SK_URL, "export const SB_URL_DEFAULT = '%s';" % CFG['SB_URL'])
    s = s.replace("export const SB_ANON_DEFAULT = '%s';" % SK_ANON, "export const SB_ANON_DEFAULT = '%s';" % CFG['SB_ANON'])
    # config.js načítava verejná login stránka pred auth.js – musí byť verejný tak ako auth.js
    old = "  '/tools/auth.js', '/cz/tools/auth.js'"
    assert old in s, 'PUBLIC_FILES sa nenašlo'
    s = s.replace(old, "  '/tools/auth.js', '/cz/tools/auth.js', '/tools/config.js'")
    assert SK_URL not in s and SK_ANON not in s
    return s


def build_middleware():
    s = read('middleware.js')
    old = "import { next } from '@vercel/functions';"
    assert old in s
    # rovnaká funkcia ako v @vercel/functions: Response s hlavičkou x-middleware-next: 1
    # (= pustiť požiadavku na statický súbor) + hlavičky, ktoré sa majú pridať do odpovede
    inline = ("// next() bez npm závislosti (kópia je statický web bez inštalácie balíkov)\n"
              "function next(init) {\n"
              "  const headers = new Headers((init && init.headers) || {});\n"
              "  headers.set('x-middleware-next', '1');\n"
              "  return new Response(null, { headers });\n"
              "}")
    return s.replace(old, inline)


def build_vercel_json():
    s = read('vercel.json')
    assert SK_URL in s
    return s.replace(SK_URL, CFG['SB_URL'])


def build_manifest():
    return json.dumps({
        "name": CFG['APP_NAME'] + " – požiadavky",
        "short_name": CFG['APP_NAME'],
        "description": "Požiadavky na terapiu – nezávislá CZ inštancia",
        "start_url": "/tools/Aorta/",
        "display": "standalone",
        "background_color": "#f0f2f7",
        "theme_color": "#5b0e1a",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}
        ]
    }, ensure_ascii=False, indent=2) + '\n'


def build():
    GENERATED['tools/config.js'] = build_config_js()
    GENERATED['tools/auth.js'] = build_auth()
    GENERATED['tools/login/index.html'] = build_login()
    GENERATED['tools/index.html'] = build_index()
    for js in SHARED_JS:
        if js != 'auth.js':
            GENERATED['tools/' + js] = read('tools/' + js)
    for name in [t for t, _ in TOOLS] + HIDDEN_TOOLS:
        GENERATED['tools/%s/index.html' % name] = build_tool(name)
    GENERATED['lib/brana.mjs'] = build_brana()
    GENERATED['middleware.js'] = build_middleware()
    GENERATED['vercel.json'] = build_vercel_json()
    GENERATED['manifest.webmanifest'] = build_manifest()
    GENERATED['package.json'] = json.dumps({
        "name": "cz-app", "private": True, "type": "module",
        "description": CFG['APP_NAME'] + " – nezávislá CZ kópia (statický web + Vercel Routing Middleware, bez závislostí)"
    }, ensure_ascii=False, indent=2) + '\n'
    GENERATED['index.html'] = '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/tools/Aorta/"><title>%s</title>' % CFG['APP_NAME']
    for ic in ('icon-192.png', 'icon-512.png'):
        with open(os.path.join(ROOT, 'icons', ic), 'rb') as f:
            GENERATED['icons/' + ic] = f.read()


def write_all():
    for rel, content in GENERATED.items():
        p = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        mode = 'wb' if isinstance(content, bytes) else 'w'
        with open(p, mode, **({} if mode == 'wb' else {'encoding': 'utf-8'})) as f:
            f.write(content)


def check_all():
    bad = []
    for rel, content in GENERATED.items():
        p = os.path.join(OUT, rel)
        if not os.path.exists(p):
            bad.append(rel + ' (chýba)'); continue
        with open(p, 'rb') as f:
            cur = f.read()
        exp = content if isinstance(content, bytes) else content.encode('utf-8')
        if cur != exp:
            bad.append(rel + ' (líši sa od zdroja)')
    return bad


if __name__ == '__main__':
    build()
    if '--check' in sys.argv:
        bad = check_all()
        if bad:
            print('cz-app/ nie je aktuálna voči SK zdrojom – spustite: python3 scripts/build_cz_app.py')
            for b in bad: print('  ✗ ' + b)
            sys.exit(1)
        print('cz-app/ je aktuálna (%d súborov).' % len(GENERATED))
    else:
        write_all()
        print('Vygenerované do cz-app/ (%d súborov).' % len(GENERATED))
        if '--zvysky' in sys.argv:
            for name, _ in TOOLS:
                for l in zvysky(GENERATED['tools/%s/index.html' % name]):
                    print('  SK? ' + l[:140])

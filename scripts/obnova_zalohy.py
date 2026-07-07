#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Obnova databázy cievny.sk zo zálohy (GitHub Actions artefakt).

Postup:
  1. Stiahnite artefakt zo záložky Actions (cievny-zaloha-*.zip) a rozbaľte.
  2. Dešifrujte a rozbaľte:
       gpg --decrypt zaloha-RRRR-MM-DD.tar.gz.gpg > zaloha.tar.gz
       mkdir obnova && tar xzf zaloha.tar.gz -C obnova
  3. Spustite obnovu (účet musí byť v allowliste, pre pozvanky admin):
       python3 scripts/obnova_zalohy.py --dir obnova --email vas@email.sk
     Heslo sa zadáva interaktívne. Predvolene beží NASUCHO (nič nezapíše);
     ostrý zápis: pridajte --naozaj

Skript vkladá tabuľky v poradí, ktoré rešpektuje cudzie kľúče
(oznamy pred oznam_reakcie, aorta_indikacie pred aorta_prilohy).
Existujúce riadky (rovnaké id) sa preskočia vďaka on_conflict.
Prílohy zo storage (priečinky *-subory) treba nahrať ručne cez
Supabase Studio → Storage (názov súboru: __ nahraďte za /).
"""
import argparse, getpass, glob, json, os, re, sys, urllib.request, urllib.error

SB_URL = 'https://ncqtiicfqhaturjlfxcj.supabase.co'
SB_ANON = 'sb_publishable_DX_FaXYGNx70dB6m-PfhAA_H5NHyH3k'

# Poradie rešpektujúce FK; čo tu nie je, ide na koniec v abecednom poradí.
PORADIE = [
    'povoleni_pouzivatelia', 'pozvanky',
    'oznamy', 'oznam_reakcie',
    'aorta_indikacie', 'aorta_prilohy',
    'denny_program', 'ideas',
    'objednavky_dni', 'objednavky',
    'evk_vykony', 'cas_vykony', 'pevar_vykony',
    'evk_followup', 'cas_followup', 'pevar_followup',
    'cz_evk_vykony', 'cz_cas_vykony', 'cz_pevar_vykony',
    'cz_evk_followup', 'cz_cas_followup', 'cz_pevar_followup', 'cz_ideas',
]
# primárny kľúč pre on_conflict (preskočenie už existujúcich riadkov)
PK = {'povoleni_pouzivatelia': 'email'}

def login(email, heslo):
    d = json.dumps({'email': email, 'password': heslo}).encode()
    req = urllib.request.Request(SB_URL + '/auth/v1/token?grant_type=password', data=d,
                                 headers={'apikey': SB_ANON, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req))['access_token']

def main():
    ap = argparse.ArgumentParser(description='Obnova zálohy cievny.sk do Supabase')
    ap.add_argument('--dir', required=True, help='priečinok s <tabulka>_RRRR-MM-DD.json súbormi')
    ap.add_argument('--email', required=True, help='prihlasovací email (musí byť v allowliste)')
    ap.add_argument('--naozaj', action='store_true', help='naozaj zapísať (bez tohto beží nasucho)')
    ap.add_argument('--len', default='', help='obnoviť len vymenované tabuľky (čiarkami)')
    args = ap.parse_args()

    subory = {}
    for f in glob.glob(os.path.join(args.dir, '*.json')):
        m = re.match(r'(.+)_\d{4}-\d{2}-\d{2}\.json$', os.path.basename(f))
        if m:
            subory[m.group(1)] = f
    if not subory:
        sys.exit('V priečinku nie sú žiadne <tabulka>_RRRR-MM-DD.json súbory.')

    vyber = [t.strip() for t in args.len.split(',') if t.strip()] or None
    tabulky = [t for t in PORADIE if t in subory] + sorted(t for t in subory if t not in PORADIE)
    if vyber:
        tabulky = [t for t in tabulky if t in vyber]

    token = login(args.email, getpass.getpass('Heslo: '))
    print(('OSTRÝ ZÁPIS' if args.naozaj else 'NASUCHO (pridajte --naozaj pre zápis)') + '\n')

    for t in tabulky:
        rows = json.load(open(subory[t], encoding='utf-8'))
        if not rows:
            print(f'  {t}: 0 riadkov – preskočené')
            continue
        if not args.naozaj:
            print(f'  {t}: {len(rows)} riadkov by sa obnovilo')
            continue
        ok = chyby = 0
        pk = PK.get(t, 'id')
        for i in range(0, len(rows), 500):
            chunk = rows[i:i + 500]
            req = urllib.request.Request(
                f'{SB_URL}/rest/v1/{t}?on_conflict={pk}',
                data=json.dumps(chunk).encode(),
                headers={'apikey': SB_ANON, 'Authorization': 'Bearer ' + token,
                         'Content-Type': 'application/json',
                         'Prefer': 'resolution=ignore-duplicates,return=minimal'})
            try:
                urllib.request.urlopen(req)
                ok += len(chunk)
            except urllib.error.HTTPError as e:
                chyby += len(chunk)
                print(f'    ! {t} dávka {i//500 + 1}: HTTP {e.code} – {e.read()[:200]!r}')
        print(f'  {t}: obnovených {ok}, chybných {chyby}')

    print('\nHotovo. Prílohy (priečinky *-subory) nahrajte ručne cez Supabase Studio → Storage.')

if __name__ == '__main__':
    main()

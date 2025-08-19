# Cievy pre život – statická webstránka

Edukačný portál o cievnych ochoreniach pre pacientov a verejnosť.

## Lokálne spustenie

```bash
python3 -m http.server 8080 --directory .
```

Otvor: http://localhost:8080

## Publikovanie (GitHub Pages)

1. Vytvor verejný repo na GitHube (napr. `cievy-pre-zivot`).
2. V tomto priečinku spusti:
   ```bash
   git init
   git add .
   git commit -m "feat: inicialny obsah"
   git branch -M main
   git remote add origin git@github.com:<uzivatel>/cievy-pre-zivot.git
   git push -u origin main
   ```
3. V Settings → Pages nastav Source: GitHub Actions. Workflow `.github/workflows/deploy.yml` nasadí stránku.

Adresa: `https://<uzivatel>.github.io/cievy-pre-zivot/`

> Pozn.: `.nojekyll` vypína Jekyll, aby sa korektne servovali súbory.

## Publikovanie (Docker + Nginx)

```bash
# Build
docker build -t cievy-pre-zivot .
# Run
docker run --rm -p 8080:80 cievy-pre-zivot
```

Otvor: http://localhost:8080

## Upozornenie

Obsah je len edukačný a nenahrádza konzultáciu u lekára.
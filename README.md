# GRAND THEFT PIXEL

Et GTA-inspirert nettleserspill i retro pikselstil, men i 3D. Kjør bil, kræsj i folk, gå ut og skyt — og prøv å riste av deg politiet.

Bygget med [Three.js](https://threejs.org/) (ligger lokalt i `lib/`). Alle teksturer, figurer og lyder lages prosedyralt i koden, så det finnes ingen asset-filer og ingen byggsteg.

## Kjør spillet

ES-moduler krever en webserver (ikke åpne `index.html` direkte fra disk):

```sh
python3 -m http.server 8000
# åpne http://localhost:8000
```

Det fungerer også rett fra GitHub Pages.

## Spille på iPhone

Spillet har egne berøringskontroller som slår seg på automatisk på mobil:

1. Legg spillet på en HTTPS-adresse, f.eks. GitHub Pages (*Settings → Pages → Deploy from branch*).
2. Åpne adressen i Safari og hold telefonen **liggende**.
3. For fullskjerm: trykk *Del → «Legg til på Hjem-skjerm»* og start spillet fra ikonet.
4. Lyd: sørg for at lydløsbryteren på siden av telefonen er av.

| Kontroll | Handling |
| --- | --- |
| Venstre halvdel | Joystick: gå (dra helt ut for å løpe) / kjør (opp = gass, ned = brems/revers) |
| Høyre halvdel | Sveip for å se rundt |
| SKYT | Hold inne for å skyte – siktehjelp låser mot nærmeste mål |
| BIL | Inn i / ut av bil |
| HOPP / BREMS | Hopp til fots, håndbrekk i bil |
| Våpenknappen | Bytt våpen |
| TUT / II | Tut (i bil) / pause |

På mobil bruker spillet litt lavere detaljnivå (færre folk og biler, mindre skyggekart) for jevn bildefrekvens.

## Kontroller

| Tast | Handling |
| --- | --- |
| WASD / piltaster | Gå / kjør |
| Mus | Se rundt |
| Venstre klikk | Skyt / slå (også fra bilen) |
| Høyre klikk | Sikt (zoom over skulderen) |
| F / E | Inn i / ut av bil (stjel bilen hvis noen sitter i den) |
| Shift | Løp |
| Space | Hopp / håndbrekk (drift!) |
| 1–4, Q, musehjul | Bytt våpen: knyttneve, pistol, maskinpistol, hagle |
| H | Tut |
| P | Bytt pikselstørrelse (1–5) |
| M | Lyd av/på |

## Hva finnes i byen

- 8×8 kvartaler med pastellfargede bygg, skyskrapere, parker med palmer og fontener, strand og hav rundt.
- Trafikk som følger filer, svinger i kryss, stopper for folk og andre biler, og tuter hvis du står i veien.
- Fotgjengere som går på fortauet, krysser gata, og flykter når det smeller.
- Biler tar skade: røyk, så brann, så eksplosjon (med kjedereaksjoner).
- Ettersøkt-nivå med 1–5 stjerner. Politiet kommer i patruljebiler, prøver å rame deg og går ut og skyter. Kom deg ut av syne, så faller stjernene.
- Penger å plukke opp, helsekryss i parkene, og «WASTED» når det går galt.

## Kode

| Fil | Innhold |
| --- | --- |
| `src/main.js` | Spill-løkke, spiller, våpen, politi, kamera, HUD og minikart |
| `src/world.js` | Byoppsett, statisk geometri og kollisjon |
| `src/car.js` | Bilmodeller, arkadefysikk og trafikk-/politi-AI |
| `src/human.js` | Klossete pikselfolk og fotgjenger-/politi-AI |
| `src/textures.js` | Prosedyrale pikselteksturer |
| `src/particles.js` | Firkantede pikselpartikler (blod, gnister, røyk, ild) |
| `src/audio.js` | Syntetiserte lydeffekter med WebAudio |
| `src/geo.js` | Slår sammen bokser til få draw calls |
| `src/touch.js` | Berøringskontroller for mobil |

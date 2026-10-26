# Testa Ponce & Nova utan publicering

1. Öppna `Ponce_Nova_Forhandsvisning.html` här i GitHub.
2. Klicka på **Download raw file** (nedladdningsikonen ovanför filen). Spara filen som `.html`.
3. Öppna den nedladdade filen i Chrome, Edge, Firefox eller Safari på datorn. Ingen installation eller lokal server behövs.

Filen är en fristående förhandsvisning av PR #2, inte den publicerade webbplatsen. En gul markering visar att det är en testversion. All kod, stil och porträtt finns i filen; inga testkurser bäddas in. Internet behövs för riktiga marknadsdata. Webbläsarens/leverantörens regler kan blockera dessa anrop; då visas ett tydligt fel och inga påhittade kurser.

## Prova detta

- Kontrollera att du känner igen alla paneler och knappar. Minska fönstret för att se mobilvyn. Öppna **Visa kontoret**.
- Kontrollera att klockorna visar rätt tid och att **KRYPTO** visar källa och uppdateringstid. Testa stora tokens, mindre tokens, nya Ethereum-pooler och sökning.
- Välj **Paper-order** vid en token, köp ett litet antal och sälj en del. Kontrollera saldot, portföljen och historiken. Det är endast simulerade USD, inga verkliga pengar.
- Skriv `/hjälp`, `/saldo`, `/analys` och `/risk` i chatten. Prova ett styrelsemöte och fliken **Ponce & Nova**. Assistenterna är lokala regler, inte ansluten AI.
- Prova riskvyn, scenarier och rapportexport. Röstfunktioner är frivilliga och beror på din webbläsare/enhet.

Förhandsvisningen använder lagringsnyckeln `ponce-nova:review:v1`, separat från appens vanliga nyckel. Uppgifter stannar i din webbläsare. Vissa webbläsare begränsar lagring från lokala filer; då visas en varning och testet körs i sessionsminnet. Du kan återställa testet under **Lagring & integritet**.

Skriv vad du vill ändra i chatten eller PR:n. Godkännande av förhandsvisningen innebär inte automatiskt godkännande att publicera. Main, GitHub Pages-inställningar och den publicerade sajten lämnas orörda.

## Återskapa filen

Från repots rot:

```sh
python3 tools/build_review.py
python3 tests/review_test.py
```

Genereringen är deterministisk för samma källfiler och kräver inga externa paket. Testet serverar endast HTML-filen internt för verifiering, eftersom den hanterade molnwebbläsaren blockerar `file://` via administratörspolicy. Direktöppning av den nedladdade filen behöver därför också kontrolleras i din vanliga webbläsare. På en maskin som tillåter lokala filer kan samma test köras med `PONCE_REVIEW_FILE_URL=1 python3 tests/review_test.py`. Ingen webbläsarpolicy ändras. Testet använder Python Playwright och systemets Chromium samt uttryckliga API-testdata; inga testdata följer med i HTML-filen. När appens källkod ändras ska filen genereras och testas på nytt.

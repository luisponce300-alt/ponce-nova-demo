# Seriös testning av Ponce & Nova

Öppna https://ponce-nova-test.onrender.com. Detta är simulerade USD; inga verkliga order kan skickas.

## Förbered sessionen

1. Ladda om sidan efter en uppdatering. Öppna **Driftstatus**: kontrollera senaste lyckade hämtning, AI-anrop/kvot och databasstatus. En konfigurerad nyckel är inte i sig ett fungerande agentsvar.
2. Öppna **Lagring & synkning** och ladda ned en fullständig backup innan större tester. Den innehåller även chatt. Rapportexport innehåller enbart handelsunderlag/aktiviteter.
3. Om den gamla lokala historiken skiljer sig från databasen får du själv välja. En tom databas kan få den lokala historiken via en särskild knapp. Hämtning av serverversionen bevarar den lokala kopian för nedladdning. Ändringar från två enheter får inte skriva över varandra tyst.
4. Kontrollera varje kurs tidsstämpel. Vald kryptolista uppdateras cirka var 65:e sekund. Innehavskontrollen körs separat var 30:e sekund när sidan är synlig och automatisk hämtning är på, även på fliken Nya pooler.

## Testa order

- Börja med små belopp i BTC/ETH/SOL och jämför köp, innehav, avgift, försäljning och resultat.
- På stödda USD-par är orderboksmodellen förvald. Appen hämtar bästa köp-/säljkurs och antal på den prisnivån, väntar simulerade 0,5 sekunder och beräknar avslutet. Om nivån inte räcker blir det delavslut; resterande antal makuleras i simuleringen.
- Avgift 0,10 % och extra ogynnsam prisrörelse 0,05 % per order är förvalda antaganden. De är inte börsens faktiska avgifter eller garanterad slippage. Kostnadsantagandet kan stängas av för jämförelse; orderbokens verkligt observerade spread finns ändå kvar.
- Färsk orderbok krävs (högst tio sekunders observationsålder). Utan orderbok används tydligt märkt referenssimulering, med högst fem minuter gamla kurser. Ogiltigt saldo, otillräckligt innehav eller felaktig kurs avvisar ordern.
- Orderboken är en ögonblicksbild: ingen riktig likviditet reserveras, ingen prisnivå förbrukas på börsen och upprepade testorder kan återanvända samma synliga likviditet. Modellen återskapar inte köprioritet, dolda order, marknadspåverkan eller fulla börsstopp.

## Testa mobil/dator och backup

Skriv ett testmeddelande på ena enheten och öppna samma privata testmiljö på den andra. Serverändringar hämtas ungefär var 20:e sekund när inga lokala ändringar väntar. Samtidiga ändringar kan ge konflikt: exportera den lokala kopian och välj serverversionen under Lagring & synkning. Nya order pausas vid konflikt. Återställning av en fullständig JSON-backup kräver både filval och bekräftelse; aktuell kopia bevaras lokalt.

## Neon Free

1. Skapa ett separat gratisprojekt på https://console.neon.tech och behåll Free-planen.
2. Öppna projektet → **Connect**. Kopiera PostgreSQL-anslutningssträngen som börjar med `postgresql://`. Om verktyget visar ett psql-kommando behövs själva anslutningsadressen, utan kommandot/omgivande citattecken.
3. I [Renders testtjänst](https://dashboard.render.com/web/srv-dbdntugae00c738rqj6g) → **Environment** → **+ Add Environment Variable**, lägg in `DATABASE_URL` med adressen som skyddat värde. Skicka den inte i chatten och lägg den inte i Git.
4. Spara och driftsätt testtjänsten. Appen skapar egna tabeller. Driftstatus visar om anslutningen verkligen svarar.

De senaste 20 serverversionerna sparas i samma databas. Det är inte en fristående extern säkerhetskopia; ladda ned egna backupfiler. Alla med testlösenordet delar denna arbetsyta. Lokal radering tar inte bort databasens innehåll. Gratisprojektets livslängd, kvoter och kontovillkor styrs av Neon.

## Kvarvarande begränsningar

Offentliga API:er kan ge anropsgränser och avbrott. Reservkällan visar ett urval USD-par, inte CoinGeckos ursprungliga rankning. Saknade 24-timmarsförändringar eller börsvärden visas som saknade. Yahoo-kurser kan vara fördröjda; guldpanelen visar en termin, inte spot. BLS-adaptern är en begränsad amerikansk publiceringskalender. Kontrollera faktiskt liveutfall i Driftstatus/PR; ett installerat adapterstöd är ingen garanti för att källan svarar.

AI-rollerna svarar på begäran och får aktuellt tillgängligt kursunderlag, men har inga orderverktyg. Grok är inte anslutet och ingen betald modell har aktiverats. Seriös testning kräver fortfarande din bedömning av svar och felutfall; systemet är inte klart för verkliga pengar.

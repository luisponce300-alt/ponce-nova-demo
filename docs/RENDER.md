# Separat Render-testmiljö med AI-roller

**Aktuellt AI-val:** Gemini 2.5 Flash för bygg/test på ett av ägaren verifierat Google-projekt på Free tier. Se [aktuella inställningar och säker nyckelguide](AI_PROVIDERS.md). OpenAI-inställningarna nedan beskriver den tidigare adaptern och är nu endast relevanta för uttryckligen vald betald drift. AI_PROVIDER/AI_USAGE_MODE och Gemini-inställningarna i render.yaml är styrande för nya tester. Ingen gratis- eller liveverifiering av en riktig Gemini-nyckel har gjorts ännu.

Detta är en lösenordsskyddad testtjänst, helt separat från befintlig GitHub Pages. GitHub-grenen är `feature/issue-1-interactive-dashboard`. Ingen merge till main krävs. `render.yaml` beskriver en ny Node-webbtjänst `ponce-nova-test` på Free-planen i Frankfurt med automatisk deployment avstängd. Inga befintliga tjänster eller domäner ska ändras. Render kan ha kontokrav för att aktivera Free; välj inte en betalplan utan ägarens godkännande.

## Åtkomst för assistenten

Ägaren skapar en Render API-nyckel under **Account Settings → API Keys**. Lägg den säkert i den här molnmiljöns hemlighetsfält `RENDER_API_TOKEN`, med tillåtet HTTPS-mål `api.render.com`, och spara. Skicka aldrig nyckeln i chatten. Den används för Render-administration och ska inte läggas i frontend eller i testappens miljövariabler. En inloggning i Render i ägarens webbläsare ger inte i sig assistenten API-åtkomst.

En sparad konfigurationsdeklaration betyder inte att en nyckel har lagts in eller att den finns i den körande maskinen. Verifiera före deployment med en read-only API-förfrågan till `GET https://api.render.com/v1/owners`. Skriv aldrig ut nyckel, råa miljövariabler eller credential-filer. En proxybunden nyckel kan vara en platshållare och måste användas genom det tillåtna HTTPS-målet; försök inte extrahera den.

## Tjänstens inställningar

| Fält | Värde |
| --- | --- |
| Repository | `luisponce300-alt/ponce-nova-demo` |
| Branch | `feature/issue-1-interactive-dashboard` |
| Runtime | Node 24.19.0 |
| Build | `npm ci --ignore-scripts` |
| Start | `npm start` |
| Health check | `/healthz` |
| Plan | Free |
| Auto-deploy | Off |

Blueprinten ska läsas från feature-grenen, inte main. [Renders Blueprint-specifikation](https://render.com/docs/blueprint-spec) verifierar `branch`, `autoDeployTrigger: "off"`, `generateValue: true` och `sync: false`. Ett blueprint-imports-/deploy-steg ska först kontrolleras mot den aktuella tjänstens diff. Om en tjänst med samma namn redan finns ska den inspekteras och inte skrivas över blint.

## Hemligheter på Render

- **PREVIEW_PASSWORD:** Render genererar ett slumpat 256-bitarsvärde. Ägaren hittar det under tjänstens **Environment** och använder det vid inloggning. Dela inte lösenordet i GitHub eller chatten.
- **SESSION_SECRET:** Render genererar ett separat slumpat värde för signerade sessioner. Minst 32 tecken. Rotation loggar ut gamla sessioner.
- **AI_API_KEY:** Lägg OpenAI-nyckeln direkt i tjänstens skyddade Environment-inställningar på Render. Blueprintens `sync: false` innebär säker manuell inmatning. Denna nyckel är skild från Render API-nyckeln. Ingen nyckel får hamna i HTML eller Git. En cloud-proxy-platshållare ska aldrig kopieras som om den vore den verkliga nyckeln.
- **AI_MODEL:** `gpt-4.1-mini`, ändringsbar serverinställning.
- **MAX_AGENT_RUNS_PER_HOUR:** `20` som standard. Detta är en lokal processgräns, inte en garanterad faktureringsgräns; den återställs vid omstart. Ett AI-styrelsemöte gör sju anrop. Sätt även en lämplig användningsbudget i AI-leverantörens konto.
- **NODE_ENV:** `production`. Render tillhandahåller `RENDER_EXTERNAL_URL`; alternativt behövs en explicit HTTPS-`PUBLIC_ORIGIN` för samma-origin-kontrollen.

## Agenternas beteende

Sju roller: Ponce, Nova, Analys, Handel, Risk & ekonomi, Teknik & utveckling, Utveckling. Detta är rollstyrda modell-anrop, inte självständiga bakgrundsprocesser. AI-svar kräver att användaren väljer **AI-svar** och skickar en fråga, eller uttryckligen begär en sjurollers AI-genomgång i mötesdialogen. Slash-kommandon och lokala verktyg fungerar fortfarande utan AI. Saknad/ogiltig AI-nyckel visas ärligt; inga fabricerade AI-svar används som fallback.

Servern anropar OpenAI Responses API med `store: false`, fast rollinstruktion och högst 700 output-tokens. Den ger modellen inga verktyg, orderbehörigheter, kontoåtkomst, filåtkomst eller webbsökning. Serverhämtade, färska CoinGecko-data skickas som prisunderlag. Frågan och en sammanfattning av den lokala **simulerade** portföljen skickas också; den är uttryckligen obetrodd/användarlämnad. Vid datakällfel anger underlaget att marknadsdata saknas.

Chatt och paper-ledger lagras fortfarande i webbläsaren, inte i en delad databas. Svar märks **AI-svar**; detta betyder inte att påståendena är faktagranskade eller säkra. Uppdatera sidan för att fånga en nyligen inlagd servernyckel. Agentstatistik visar definierade roller, inte påhittade aktiva processer. Agenterna kan inte lägga order; all handel är lokal och simulerad.

## Servergränser

Inloggningen använder en scrypt-jämförelse av lösenord och signerad HttpOnly/SameSite=Strict-session. HTTPS-tjänster får Secure-cookie. POST kräver samma Origin, inklusive login/logout och AI. Login och AI har processbaserad begränsning; högst två AI-anrop körs samtidigt. Sessioner gäller åtta timmar. Det finns ingen individuell fleranvändarinloggning eller revisionssäker databas i denna testversion.

Bara uttryckligen listade frontendfiler serveras; serverkod, Git, dokumentation och hemliga filer går inte att hämta via webbservern. `/healthz` är publikt men innehåller bara minimal hälsostatus. `/api/config` och resten av appen kräver inloggning. Marknadsproxy använder fasta leverantörs-URL:er och en minuts cache, inte användarstyrda destinationer. API-nycklar lämnar aldrig servern till klienten. Ingen TLS-verifiering stängs av och inga certifikatlager ändras.

## Validering före extern drift

```sh
npm ci --ignore-scripts
npm test
python3 tests/browser_test.py
python3 tools/build_review.py
python3 tests/review_test.py
python3 tests/server_browser_test.py
```

Server- och AI-tester använder uttryckliga testcredentials och stubbade provider-svar; det är inte bevis på ett riktigt OpenAI-anrop. Riktiga TLS-verifierade marknadssvar har däremot verifierats genom Node-serverns proxy. Molnmaskinens Node-process behöver `NODE_USE_ENV_PROXY=1` för dessa externa anrop; Render behöver normalt inte denna inställning. Inga riktiga hemligheter ska användas för att köra de lokala testsuiterna.

Efter att Render är anslutet: verifiera tjänstens branch, plan och domän, bygg, hämta `/healthz`, kontrollera att root kräver login, logga in utan att exponera lösenordet, prova marknadsdata, ett riktigt AI-svar och paper trading. Kontrollera att main och Pages-inställningar är oförändrade. Rapporterad readiness ska skilja mellan lokala stubtester, verkliga upstream-anrop och faktisk Render-deployment. Miljön är inte online eller verkligt AI-verifierad förrän detta har lyckats.

## Deployed preview — 2026-10-23

Render API access was successfully verified using the existing user-supplied vault binding, which used a different variable name from the originally requested `RENDER_API_TOKEN`. The existing binding was reused without printing its name/value or requesting a duplicate.

A NEW Free/Frankfurt service was created: `ponce-nova-test`, service ID `srv-dbdntugae00c738rqj6g`, URL `https://ponce-nova-test.onrender.com`, dashboard `https://dashboard.render.com/web/srv-dbdntugae00c738rqj6g`. Deployment `dep-dbdntvgae00c738rqm80` is reported **live** by Render for commit `30300c37854b6bdaef2b123fc8f4e67c7a47b3ad`. Branch remains `feature/issue-1-interactive-dashboard`, auto-deploy `no`, plan `free`, service not suspended. The pre-existing unrelated service was not changed.

`PREVIEW_PASSWORD` and `SESSION_SECRET` were generated securely during creation and stored only in Render. The owner can reveal `PREVIEW_PASSWORD` in the service's **Environment** tab to log in. No password was printed or committed. **AI_API_KEY is absent**, so real AI replies are not enabled. Supply that key directly in Render's protected service settings and redeploy/restart, then verify one actual AI response before claiming AI readiness.

Direct external checks from this cloud machine currently receive a network-proxy `403 Forbidden` for the new onrender.com hostname. The exact hostname has been added to the environment network draft, but a draft does not apply runtime access. Render's live deployment status and configuration were verified through its API; independent external HTTP/login checks remain pending. Local authenticated browser/server tests and real upstream market-data rendering passed earlier. Main and the production Pages site remain unchanged.

## Current serious-test build

The current build adds `MARKET_FEEDS_ENABLED=true`, optional server-only Neon `DATABASE_URL`, TLS-verified PostgreSQL, automatic schema initialization, revision/conflict checks and previous-version backups. Render builds run `npm ci --omit=dev --ignore-scripts`; `pg` is a production dependency and PGlite is test-only. Secrets must stay in Render, never in Git/client code. A malformed database setting produces a diagnostic/local mode rather than breaking the whole market dashboard.

The Gemini model is pinned to 3.8 Flash (not the retired-for-new-users 2.5 Flash). [Current serious-test guide](SERIOUS_TESTING.md) and [market data limits](MARKET_DATA.md) supersede historical prepared/not-connected statements above. Actual live verification is recorded in the PR. No new paid Render service/disk/database has been provisioned.

# Enkla agentrummet

Öppna https://ponce-nova-test.onrender.com/agents och använd samma testlösenord som tidigare.

1. Välj **Ponce**, **Nova** eller någon av de fem avdelningsrollerna.
2. Skriv en fråga och tryck **Skicka till agenten**.
3. Använd **Fråga alla sju** om varje roll ska svara på samma fråga. Svaren kommer i turordning. **Stoppa kommande svar** avbryter kommande anrop; ett redan påbörjat svar kan slutföras.

Rummet startar utan databas- eller marknadsflöden. Inga livekurser eller portföljdata skickas till modellerna i detta läge. Roller kan diskutera dina uppgifter men inte utföra affärer, använda konton eller ändra filer/system. Den ursprungliga dashboarden finns kvar via länken i sidhuvudet.

Modellen är pinnad till Gemini 3.1 Flash-Lite med minimal thinking och ägarbekräftad gratisnivå. Ingen betald modell eller automatisk reservmodell aktiveras. Det finns 30 sekunders paus mellan anrop och högst 20 anrop per servertimme; dessa gränser delas med dashboarden. En gruppfråga räknas som sju anrop och tar minst cirka tre minuter. Leverantörens egna begränsningar kan också gälla.

Chattar sparas i denna webbläsare under en separat lagringsnyckel, utan databas-synkning. Spara chatt laddar ned aktuell konversation. Högst sex korta tidigare meddelanden, max 500 tecken per meddelande, skickas med nästa fråga. Historiken är begränsad; rollerna har inget annat beständigt minne. Gratisleverantörens villkor kan tillåta användning för produktförbättring. Använd bara testdata och dela inga hemligheter.

Anslutningskontrollen läser konfiguration, inte ett dolt modelltest. Fel visas som systemmeddelanden och blir aldrig fabricerade agentsvar. Om servern inte svarar: tryck **Kontrollera anslutning**. Ett nytt AI-försök kräver ditt aktiva val efter eventuell väntetid.

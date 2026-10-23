// Role definitions are shared by the dashboard and its optional preview server.
export const AGENTS = Object.freeze([
  {
    id: "ponce",
    name: "Ponce",
    department: "Ledning",
    room: "Mötesrum",
    description: "Sammanställer underlag, prioriterar och föreslår nästa steg.",
  },
  {
    id: "nova",
    name: "Nova",
    department: "Oberoende kontroll",
    room: "Mötesrum",
    description: "Granskar antaganden, datakvalitet, risker och osäkerheter.",
  },
  {
    id: "analysis",
    name: "Analys",
    department: "Analys",
    room: "AI-labb",
    description: "Undersöker hämtade kryptokurser och förklarar prisrörelser.",
  },
  {
    id: "trading",
    name: "Handel",
    department: "Handel",
    room: "Kontrollrum",
    description: "Diskuterar manuella paper-order och deras begränsningar.",
  },
  {
    id: "risk",
    name: "Risk & ekonomi",
    department: "Risk & ekonomi",
    room: "Kontrollrum",
    description:
      "Bedömer koncentration och simulerat kapital utifrån tillgängligt underlag.",
  },
  {
    id: "technology",
    name: "Teknik & utveckling",
    department: "Teknik & utveckling",
    room: "AI-labb",
    description:
      "Förklarar integrationer, datakällor och tekniska begränsningar.",
  },
  {
    id: "development",
    name: "Utveckling",
    department: "Utveckling",
    room: "AI-labb",
    description:
      "Föreslår förbättringar och utvärdering av simuleringen utan att påstå att modeller tränas.",
  },
]);

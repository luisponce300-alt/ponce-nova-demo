import pg from "pg";
import { replayLedger } from "../core.js";
import { AGENTS } from "../agents.js";

const failure = (status, message) => Object.assign(new Error(message), { status });
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.ledger) || !value.chats || !Array.isArray(value.events))
    throw failure(400, "Ogiltigt sparformat.");
  try { replayLedger(value.ledger); } catch { throw failure(400, "Orderhistoriken är ogiltig."); }
  for (const channel of ["shared", "agents"]) {
    if (!Array.isArray(value.chats[channel]) || value.chats[channel].length > 100 || value.chats[channel].some(m =>
      !m || !["Du", "System", ...AGENTS.map(a=>a.name)].includes(m.author) || typeof m.text !== "string" || m.text.length > 12000 || !Number.isFinite(m.time)))
      throw failure(400, "Chatthistoriken är ogiltig.");
  }
  if (value.events.length > 100 || value.events.some(e=> !e || typeof e.text !== "string" || e.text.length > 2000 || !Number.isFinite(e.time)))
    throw failure(400, "Aktivitetsloggen är ogiltig.");
  return { version: 1, ledger: value.ledger, chats: { shared: value.chats.shared, agents: value.chats.agents }, events: value.events };
}

export function createStorage(env, poolOverride) {
  let initialized = false, healthy = false, initialization = null;
  let pool = poolOverride;
  if (!pool && env.DATABASE_URL) {
    let url;
    try { url = new URL(env.DATABASE_URL); } catch { throw new Error("DATABASE_URL är ogiltig."); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech"))
      throw new Error("Testdatabasen måste använda en Neon PostgreSQL-anslutning.");
    // Always verify TLS. URL sslmode options must not silently override this.
    url.search = ""; // URI query options cannot override the validated host or TLS policy.
    pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 2,
      connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, statement_timeout: 10000 });
    pool.on("error", () => { healthy = false; });
  }
  async function initialize() {
    if (!pool) throw failure(503, "Beständig databas är inte ansluten. Lokal lagring används.");
    if (initialized) return;
    if (initialization) return initialization;
    initialization = (async()=>{
      await pool.query(`CREATE TABLE IF NOT EXISTS ponce_nova_preview_state (
        id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL,
        state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ponce_nova_preview_backups (
        revision integer PRIMARY KEY, state jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`INSERT INTO ponce_nova_preview_state (id, revision, state) VALUES (1, 0, $1) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify({ version: 1, ledger: [], chats: { shared: [], agents: [] }, events: [] })]);
      initialized = true;
    })();
    try { await initialization; } finally { initialization = null; }
  }
  async function read() {
    try {
      await initialize();
      const result = await pool.query("SELECT revision, state, updated_at FROM ponce_nova_preview_state WHERE id = 1");
      healthy = true;
      return { revision: result.rows[0].revision, state: validateState(result.rows[0].state), updatedAt: result.rows[0].updated_at };
    } catch (e) { healthy = false; throw e.status ? e : failure(503, "Databasen kunde inte nås. Dina lokala data bevaras."); }
  }
  async function write(revision, state) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw failure(400, "Ogiltig lagringsversion.");
    state = validateState(state);
    let client;
    try {
      await initialize();
      client = await pool.connect();
      await client.query("BEGIN");
      const previous = await client.query("SELECT revision, state FROM ponce_nova_preview_state WHERE id = 1 FOR UPDATE");
      if (previous.rows[0].revision !== revision) throw failure(409, "En annan enhet har nyare data. Exportera dina lokala ändringar innan du hämtar serverversionen.");
      await client.query("INSERT INTO ponce_nova_preview_backups (revision, state) VALUES ($1,$2) ON CONFLICT DO NOTHING", [revision, JSON.stringify(previous.rows[0].state)]);
      const result = await client.query("UPDATE ponce_nova_preview_state SET revision = revision + 1, state = $1, updated_at = now() WHERE id = 1 RETURNING revision, updated_at", [JSON.stringify(state)]);
      await client.query("DELETE FROM ponce_nova_preview_backups WHERE revision < $1", [Math.max(0, revision - 19)]);
      await client.query("COMMIT");
      healthy = true;
      return { revision: result.rows[0].revision, updatedAt: result.rows[0].updated_at };
    } catch (e) {
      if (client) await client.query("ROLLBACK").catch(()=>{});
      healthy = e.status === 409;
      throw e.status ? e : failure(503, "Ändringarna kunde inte sparas på servern. Lokal kopia bevaras.");
    } finally { client?.release(); }
  }
  return { configured: !!pool, read, write, status: () => ({ configured: !!pool, healthy, backup: "De senaste 20 versionerna i samma databas; export behövs också." }), close: () => pool?.end() };
}

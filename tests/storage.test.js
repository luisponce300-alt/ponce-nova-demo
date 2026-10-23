import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createStorage, validateState } from "../server/storage.js";
const empty=()=>({version:1,ledger:[],chats:{shared:[],agents:[]},events:[]});
test("persistent SQL state uses revisions, preserves previous versions, and refuses stale writes",async()=>{
  const db=new PGlite();
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const store=createStorage({},pool);
  try {
    const original=await store.read();assert.equal(original.revision,0);
    const state=empty();state.chats.shared.push({author:"Du",text:"Test från mobil",time:1});
    assert.equal((await store.write(0,state)).revision,1);
    await assert.rejects(store.write(0,empty()),e=>e.status===409);
    assert.deepEqual((await store.read()).state,state);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM ponce_nova_preview_backups")).rows[0].count,1);
    for(let i=1;i<23;i++)await store.write(i,state);
    const backups=await db.query("SELECT count(*)::int AS count, min(revision) AS oldest FROM ponce_nova_preview_backups");
    assert.equal(backups.rows[0].count,20);assert.equal(backups.rows[0].oldest,3);
    const restarted=createStorage({},pool);
    assert.equal((await restarted.read()).revision,23);
    assert.deepEqual((await restarted.read()).state,state);
  } finally {await db.close();}
});
test("missing database stays explicitly local; invalid ledger/messages and unsafe connection hosts are rejected",async()=>{
  const store=createStorage({});assert.equal(store.configured,false);
  await assert.rejects(store.read(),e=>e.status===503);
  assert.throws(()=>createStorage({DATABASE_URL:"postgres://test:test@evil.test/test"}));
  assert.throws(()=>validateState({...empty(),ledger:[{}]}),e=>e.status===400);
  const state=empty();state.chats.shared=[{author:"attacker",text:"x",time:1}];
  assert.throws(()=>validateState(state),e=>e.status===400);
});

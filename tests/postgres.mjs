import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresStore, StorageConflict } from '../apps/server/dist/postgres.js';

// PGlite executes real PostgreSQL SQL in WASM; no cloud credentials needed.
const database = new PGlite();
try {
  const store = createPostgresStore(database);
  const initial = await store.read();
  assert.deepEqual(initial, { users: [], activities: [], applications: [] });
  initial.users.push({ id: 'telegram:1', name: 'Ира', age: 20, ageGroup: '16+' });
  await store.write(initial);
  const restartedStore = createPostgresStore(database);
  assert.equal((await restartedStore.read()).users[0].name, 'Ира', 'new store must preserve existing data');
  const first = await store.read();
  const stale = await restartedStore.read();
  first.users[0].age = 21;
  await store.write(first);
  stale.users[0].age = 99;
  await assert.rejects(restartedStore.write(stale), StorageConflict);
  assert.equal((await store.read()).users[0].age, 21, 'stale writes must not overwrite committed data');
  await assert.rejects(store.importIntoEmpty(initial), /not empty/);
  await assert.rejects(store.write({ users: [], activities: [], applications: [] }), /Read database/);
  console.log('PASS: PostgreSQL initialization, writes, restart preservation, stale-write protection, import refusal');
} finally { await database.close(); }

const freshDatabase = new PGlite();
try {
  const store = createPostgresStore(freshDatabase);
  const backup = { users: [{ id: 'max:7', name: 'Test', age: 18, ageGroup: '16+' }], activities: [], applications: [] };
  await store.importIntoEmpty(backup);
  assert.deepEqual(await store.read(), backup);
  await assert.rejects(store.importIntoEmpty(backup), /not empty/);
  console.log('PASS: one-time backup import into an empty PostgreSQL database');
} finally { await freshDatabase.close(); }

// Persist to disk, close the database engine, and reopen it.
const { mkdtemp } = await import("node:fs/promises");
const { join } = await import("node:path");
const directory = await mkdtemp(join(process.cwd(), ".postgres-test-"));
const before = new PGlite(directory);
const beforeStore = createPostgresStore(before);
const saved = await beforeStore.read();
saved.users.push({ id: "telegram:42", name: "Persistent", age: 19, ageGroup: "16+" });
saved.friendships=[{id:"friend-test",from:"telegram:42",to:"max:77",status:"pending",createdAt:new Date().toISOString()}];
saved.reviews=[{id:"review-test",activityId:"meeting",authorId:"max:77",targetId:"telegram:42",score:5,text:"Test",attended:true,createdAt:new Date().toISOString()}];
await beforeStore.write(saved);
await before.close();
const after = new PGlite(directory);
try {
  assert.equal((await createPostgresStore(after).read()).users[0].id, "telegram:42");
  const restored=await createPostgresStore(after).read();
  assert.equal(restored.friendships[0].id,"friend-test"); assert.equal(restored.reviews[0].score,5);
  console.log("PASS: social data persists; data survives database engine shutdown and reopen from disk");
} finally { await after.close(); }

import { assertExactly68, listAgents } from '../src/runtime/registry.js';

assertExactly68();
const agents = listAgents();
console.log(JSON.stringify({ ok: true, count: agents.length, ids: agents.map((a) => a.id) }, null, 2));

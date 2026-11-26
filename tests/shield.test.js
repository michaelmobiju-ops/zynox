import test from "node:test";
import assert from "node:assert/strict";
import {shield} from "../src/shield.js";
const url="https://example.com/api/shield/sessions/revoke-others";
test("rejects GET",async()=>assert.equal((await shield(new Request(url),{})).status,405));
test("rejects cross-origin",async()=>assert.equal((await shield(new Request(url,{method:"POST",headers:{Origin:"https://evil.example"}}),{})).status,403));
test("rejects missing session",async()=>assert.equal((await shield(new Request(url,{method:"POST",headers:{Origin:"https://example.com"}}),{})).status,401));
test("rejects malformed session without database access",async()=>assert.equal((await shield(new Request(url,{method:"POST",headers:{Origin:"https://example.com",Cookie:"zynox_session=bad"}}),{})).status,401));

import test from "node:test";import assert from "node:assert/strict";import {csvCell,hashApiKey,publicApi} from "../src/public-api.js";
test("CSV neutralizes formulas and quotes",()=>{assert.equal(csvCell("=1+1"),"\"'=1+1\"");assert.equal(csvCell('a"b'),'"a""b"');});
test("API rejects missing credentials",async()=>assert.equal((await publicApi(new Request("https://example.com/api/v1/products"),{})).status,401));
test("hash deterministic",async()=>assert.equal((await hashApiKey("test")).length,64));

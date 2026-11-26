import test from "node:test";import assert from "node:assert/strict";import {monitor,ownerMetrics} from "../src/operations.js";
test("monitor reports real failed probe",async()=>{const r=await monitor(new Request("https://example.com/api/monitor/health"),{DB:{prepare(){throw Error("offline")}}});assert.equal(r.status,503);assert.equal((await r.json()).database,"unavailable");});
test("monitor reports successful probe",async()=>{const r=await monitor(new Request("https://example.com/api/monitor/health"),{DB:{prepare(){return {first:async()=>({ok:1})}}}});assert.equal(r.status,200);assert.equal((await r.json()).database,"reachable");});
test("owner metrics rejects anonymous",async()=>assert.equal((await ownerMetrics(new Request("https://example.com/api/owner/metrics"),{})).status,403));

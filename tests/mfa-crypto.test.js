import test from "node:test";import assert from "node:assert/strict";import {totp,base32,encryptSecret,decryptSecret,matchingStep} from "../src/mfa-crypto.js";
const secret=new TextEncoder().encode("12345678901234567890");
test("RFC 6238 SHA1 vector",async()=>{assert.equal(await totp(secret,1,8),"94287082");assert.equal(await matchingStep(secret,"287082",59000),1);});
test("base32 vector",()=>assert.equal(base32(new TextEncoder().encode("foobar")),"MZXW6YTBOI"));
test("AES GCM binds ciphertext to account",async()=>{const env={MFA_ENCRYPTION_KEY:"ab".repeat(32)};const a=await encryptSecret(secret,"a",env);assert.deepEqual(await decryptSecret(a,"a",env),secret);await assert.rejects(decryptSecret(a,"b",env));assert.notEqual(a,await encryptSecret(secret,"a",env));});

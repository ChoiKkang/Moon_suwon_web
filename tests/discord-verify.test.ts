import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDiscordRequest } from '../src/lib/discord/verify';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(body: string, timestamp: string) {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const message = new TextEncoder().encode(timestamp + body);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, message as BufferSource));
  return { publicKey: toHex(raw), signature: toHex(signature) };
}

test('accepts a correctly signed request', async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const { publicKey, signature } = await signedRequest(body, timestamp);

  assert.equal(await verifyDiscordRequest({ publicKey, signature, timestamp, rawBody: body }), true);
});

test('rejects a tampered body', async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const { publicKey, signature } = await signedRequest(body, timestamp);

  const tampered = JSON.stringify({ type: 2, data: { name: '달빛' } });
  assert.equal(await verifyDiscordRequest({ publicKey, signature, timestamp, rawBody: tampered }), false);
});

test('rejects a stale timestamp', async () => {
  const body = JSON.stringify({ type: 1 });
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
  const { publicKey, signature } = await signedRequest(body, staleTimestamp);

  assert.equal(await verifyDiscordRequest({ publicKey, signature, timestamp: staleTimestamp, rawBody: body }), false);
});

test('rejects missing or malformed headers', async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const { publicKey, signature } = await signedRequest(body, timestamp);

  assert.equal(await verifyDiscordRequest({ publicKey, signature: null, timestamp, rawBody: body }), false);
  assert.equal(await verifyDiscordRequest({ publicKey, signature, timestamp: null, rawBody: body }), false);
  assert.equal(await verifyDiscordRequest({ publicKey, signature: 'zz', timestamp, rawBody: body }), false);
  assert.equal(await verifyDiscordRequest({ publicKey: 'not-hex', signature, timestamp, rawBody: body }), false);
});

test('rejects a signature from a different key', async () => {
  const body = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const first = await signedRequest(body, timestamp);
  const second = await signedRequest(body, timestamp);

  assert.equal(await verifyDiscordRequest({ publicKey: first.publicKey, signature: second.signature, timestamp, rawBody: body }), false);
});

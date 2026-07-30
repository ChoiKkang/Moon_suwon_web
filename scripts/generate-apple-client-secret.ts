/**
 * Apple Sign In용 client secret(JWT)을 생성한다.
 *
 * Apple은 OAuth client secret으로 고정 문자열이 아닌 ES256 서명 JWT를 요구한다.
 * 이 JWT는 최대 6개월(15777000초) 유효하며, 만료 전에 재발급해야 한다.
 *
 * 사용법:
 *   npm run apple:secret
 *
 * 필요한 환경변수:
 *   APPLE_TEAM_ID           Apple Developer 팀 ID
 *   APPLE_SERVICE_ID        Services ID (웹 로그인용 client_id)
 *   APPLE_KEY_ID            .p8 키 ID
 *   APPLE_PRIVATE_KEY_PATH  .p8 파일 경로
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Apple이 허용하는 client secret 최대 수명(초). 6개월.
const MAX_LIFETIME_SECONDS = 15777000;
const APPLE_AUDIENCE = 'https://appleid.apple.com';

function getRequiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`필수 환경변수가 없습니다: ${key}`);
  }

  return value;
}

// JWT는 패딩 없는 base64url 인코딩을 사용한다.
function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ES256 서명은 DER 형식으로 나오므로 JWT가 요구하는 R||S 원시 형식으로 변환한다.
function derToJoseSignature(der: Buffer): Buffer {
  if (der[0] !== 0x30) {
    throw new Error('ES256 서명 DER 구조가 올바르지 않습니다.');
  }

  let offset = der[1] & 0x80 ? 3 : 2;

  if (der[offset] !== 0x02) {
    throw new Error('ES256 서명에서 R 값을 찾을 수 없습니다.');
  }

  const rLength = der[offset + 1];
  const r = der.subarray(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;

  if (der[offset] !== 0x02) {
    throw new Error('ES256 서명에서 S 값을 찾을 수 없습니다.');
  }

  const sLength = der[offset + 1];
  const s = der.subarray(offset + 2, offset + 2 + sLength);

  // P-256 곡선은 R, S 각각 32바이트 고정 길이를 사용한다.
  const normalize = (value: Buffer): Buffer => {
    const trimmed = value[0] === 0x00 ? value.subarray(1) : value;

    if (trimmed.length > 32) {
      throw new Error('ES256 서명 값 길이가 32바이트를 초과합니다.');
    }

    return Buffer.concat([Buffer.alloc(32 - trimmed.length), trimmed]);
  };

  return Buffer.concat([normalize(r), normalize(s)]);
}

function createAppleClientSecret(): { token: string; expiresAt: Date } {
  const teamId = getRequiredEnv('APPLE_TEAM_ID');
  const serviceId = getRequiredEnv('APPLE_SERVICE_ID');
  const keyId = getRequiredEnv('APPLE_KEY_ID');
  const privateKeyPath = getRequiredEnv('APPLE_PRIVATE_KEY_PATH');

  const privateKey = readFileSync(privateKeyPath, 'utf8');

  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error('PKCS#8 형식의 .p8 개인키 파일이 아닙니다.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAt + MAX_LIFETIME_SECONDS;

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: issuedAt,
    exp: expiresAtSeconds,
    aud: APPLE_AUDIENCE,
    sub: serviceId,
  };

  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;

  const signer = createSign('SHA256');
  signer.update(signingInput);
  const derSignature = signer.sign({ key: privateKey, dsaEncoding: 'der' });

  return {
    token: `${signingInput}.${toBase64Url(derToJoseSignature(derSignature))}`,
    expiresAt: new Date(expiresAtSeconds * 1000),
  };
}

function main(): void {
  const { token, expiresAt } = createAppleClientSecret();

  // 토큰만 stdout으로 출력해 파이프 사용을 가능하게 하고, 안내는 stderr로 분리한다.
  process.stdout.write(`${token}\n`);
  process.stderr.write(`만료 시각: ${expiresAt.toISOString()}\n`);
  process.stderr.write('이 값을 Supabase Dashboard의 Apple provider Secret Key에 입력한다.\n');
}

main();

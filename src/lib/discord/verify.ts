// Discord Interaction 서명 검증.
//
// 순수 암호 검증 로직이라 서버 전용 표시를 두지 않는다. 비밀값을 다루지 않고
// 단위 테스트에서 직접 호출한다.
//
// Discord는 요청마다 Ed25519 서명을 보낸다. 검증에 실패한 요청은 401로 거절해야
// 하며, 실패한 요청은 절대 처리하지 않는다. 공개 키(Application Public Key)는
// 비밀값이 아니지만 환경변수로 관리해 애플리케이션 교체 시 코드 수정이 없게 한다.
//
// Node 22의 WebCrypto가 Ed25519를 지원한다. 외부 의존성을 추가하지 않는다.

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordRequest(options: {
  publicKey: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
}): Promise<boolean> {
  const { publicKey, signature, timestamp, rawBody } = options;
  if (!signature || !timestamp) return false;

  const keyBytes = hexToBytes(publicKey.trim());
  const signatureBytes = hexToBytes(signature.trim());
  if (!keyBytes || !signatureBytes || signatureBytes.length !== 64) return false;

  // 재생 공격을 줄이기 위해 5분을 넘은 요청은 거절한다.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(Date.now() / 1000 - sentAt) > 300) return false;

  try {
    const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes as BufferSource, message as BufferSource);
  } catch {
    return false;
  }
}

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
} as const;

export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  UpdateMessage: 7,
} as const;

export const MessageFlags = {
  Ephemeral: 64,
} as const;

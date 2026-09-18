# Discord 운영 명령 설정

달빛수원 운영 채널에서 브리핑 확인과 승인·공개 처리를 바로 할 수 있게 하는 설정이다. 운영자 두 명이 쓰는 비공개 채널을 전제로 한다.

## 왜 Discord에서 처리하는가

관리자 콘솔을 매일 열지 않아도 되게 하려는 목적이다. 매일 09:00 KST 자동 브리핑이 상태를 알려주고, 조치가 필요하면 그 자리에서 명령으로 끝낸다. 판정 로직은 자동 브리핑과 Discord 명령이 [같은 모듈](../src/lib/ops/briefing.ts)을 공유하므로 두 경로의 결론이 어긋나지 않는다.

## 1. Discord 애플리케이션 설정

Discord Developer Portal에서 애플리케이션을 열고 다음을 확인한다.

- **Application ID**: 슬래시 명령 등록에 사용한다. 비밀값이 아니다.
- **Public Key**: 요청 서명 검증에 사용한다. 비밀값이 아니지만 환경변수로 관리한다.
- **Bot Token**: 명령 등록에만 사용한다. 비밀값이므로 채팅·로그·커밋에 남기지 않는다.

`Bot` 탭에서 봇을 만들고, `OAuth2 > URL Generator`에서 `applications.commands` 스코프로 초대 링크를 만들어 운영 서버에 추가한다. 봇에 메시지 읽기 권한은 필요하지 않다.

`General Information > Interactions Endpoint URL`에 아래 주소를 입력한다.

```text
https://<배포-도메인>/api/discord/interactions
```

Discord가 저장 시점에 PING 요청을 보내 서명 검증을 확인한다. `DISCORD_PUBLIC_KEY`가 Vercel Production에 등록된 뒤에 저장해야 통과한다.

## 2. 환경변수

Vercel Production에 다음을 등록한다.

```dotenv
DISCORD_PUBLIC_KEY=<Application Public Key>
DISCORD_OPERATOR_IDS=<운영자 Discord 사용자 ID>,<두 번째 운영자 ID>
DISCORD_ADMIN_ACTOR_ID=<public.profiles의 ADMIN 계정 UUID>
```

`DISCORD_OPERATOR_IDS`에 없는 사용자는 명령을 실행할 수 없다. Discord 사용자 ID는 개발자 모드를 켜고 사용자를 우클릭해 복사한다.

`DISCORD_ADMIN_ACTOR_ID`는 감사 로그의 기록 주체다. `public.profiles.role = ADMIN`인 계정이어야 하며, Discord 사용자 ID는 메타데이터로 함께 남는다. 즉 "누가 Discord에서 눌렀는지"와 "어느 관리자 권한으로 기록되는지"를 모두 추적할 수 있다.

명령 등록에만 쓰는 값은 로컬 `.env.local`에 둔다. 서버 런타임에는 필요하지 않다.

```dotenv
DISCORD_APPLICATION_ID=<Application ID>
DISCORD_BOT_TOKEN=<Bot Token>
DISCORD_GUILD_ID=<운영 서버 ID>
```

## 3. 슬래시 명령 등록

```bash
npm run discord:register
```

길드 전용으로 등록하므로 즉시 반영되고 다른 서버에는 노출되지 않는다. 명령을 추가·수정한 뒤에도 같은 명령을 다시 실행한다.

## 4. 사용법

모든 응답은 ephemeral이라 명령을 실행한 사람에게만 보인다. 채널에 운영 데이터가 쌓이지 않는다.

### 조회

| 명령 | 설명 |
| --- | --- |
| `/달빛 브리핑` | 오늘 기준 운영 상태. 자동 브리핑과 같은 판정이다. |
| `/달빛 검수` | 검수 대기 후보와 이미지·문구 준비 상태 |
| `/달빛 공개대기` | 문구가 준비되어 공개만 남은 장소 |
| `/달빛 코스` | 검수 대기 코스 초안과 경유지·거리 |

조회 결과에는 각 항목에 바로 쓸 수 있는 명령이 식별자와 함께 표시된다.

### 처리

| 명령 | 설명 |
| --- | --- |
| `/달빛 승인 <id>` | 후보를 승인한다. 공개되지는 않는다. |
| `/달빛 제외 <id>` | 후보를 제외한다. 원본은 삭제하지 않는다. |
| `/달빛 보류 <id>` | 후보를 보류 상태로 되돌린다. |
| `/달빛 공개 <id>` | 승인·문구가 준비된 장소를 공개한다. |
| `/달빛 비공개 <id>` | 공개된 장소를 비공개로 전환한다. |
| `/달빛 코스보류 <id>` | 코스 초안을 보류로 기록한다. |

## 5. 안전 장치

Discord에서 실행하더라도 웹 관리자 화면과 같은 데이터 경계를 지킨다.

- 서명 검증에 실패한 요청은 401로 거절한다. 본문이 변조되거나 5분을 넘긴 요청도 거절한다.
- `DISCORD_OPERATOR_IDS`에 없는 사용자는 어떤 명령도 실행할 수 없다.
- 승인은 공개가 아니다. 공개는 설명과 야간 포인트가 모두 있는 장소에만 허용한다.
- 승인되지 않은 장소는 공개할 수 없다.
- 모든 변경은 `audit.admin_events`에 `source=discord`와 Discord 사용자 ID를 남긴다.

### 코스 공개를 Discord에서 지원하지 않는 이유

코스 공개는 실제 도보 동선, 계단·경사, 야간 조명과 체감 안전을 사람이 확인해야 한다. 저장된 거리는 좌표 직선거리 추정이며 성곽 우회로를 반영하지 않는다. 이 판단은 지도와 경유지를 함께 보며 해야 하므로 Discord에서는 보류만 지원하고 공개는 `/admin/courses`에 남긴다.

## 6. 자동 브리핑

`Daily operations briefing` 워크플로가 매일 09:00 KST에 실행되어 Discord webhook으로 결과를 보낸다. 상태에 따라 색이 다르다.

| 상태 | 색 | 의미 |
| --- | --- | --- |
| healthy | 초록 | 조치·확인 항목 없음 |
| review | 노랑 | 확인 권장만 있음 |
| action_required | 주황 | 즉시 조치 필요 |
| failed | 빨강 | 브리핑 생성 실패 |

수동 실행은 `gh workflow run daily-briefing.yml --repo ChoiKkang/Moon_suwon_web`으로 한다.

## 7. 문제 해결

Interactions Endpoint URL 저장이 실패하면 `DISCORD_PUBLIC_KEY`가 Production에 등록되었는지, 값에 공백이 섞이지 않았는지 확인한다. 엔드포인트가 503을 반환하면 이 변수가 비어 있다는 뜻이다.

명령이 "권한이 없습니다"로 응답하면 `DISCORD_OPERATOR_IDS`에 본인 사용자 ID가 있는지 확인한다. "감사 로그 계정이 설정되지 않았습니다"는 `DISCORD_ADMIN_ACTOR_ID`가 비어 있거나 ADMIN 프로필이 아닌 경우다.

봇 토큰이 노출되면 Developer Portal에서 즉시 재발급하고 `npm run discord:register`를 다시 실행한다.

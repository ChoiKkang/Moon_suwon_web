# Discord 운영 명령 설정

달빛수원 운영 채널에서 브리핑 확인과 승인·공개 처리를 바로 할 수 있게 하는 설정이다. 운영자 두 명이 쓰는 비공개 채널을 전제로 한다.

## 왜 Discord에서 처리하는가

관리자 콘솔을 매일 열지 않아도 되게 하려는 목적이다. 매일 09:00 KST 자동 브리핑이 상태를 알려주고, 조치가 필요하면 그 자리에서 명령으로 끝낸다. 판정 로직은 자동 브리핑과 Discord 명령이 [같은 모듈](../src/lib/ops/briefing.ts)을 공유하므로 두 경로의 결론이 어긋나지 않는다.

## 웹훅과 슬래시 명령의 차이

지금 쓰는 방식은 두 갈래다. 자동 브리핑은 **incoming webhook**으로 채널에 메시지를 보낸다. 단방향이라 이미 동작하고 있고 추가 설정이 없다. 반면 `/달빛` 슬래시 명령은 Discord가 우리 서버로 요청을 보내야 하므로 webhook으로는 할 수 없다. 애플리케이션과 Interactions Endpoint URL이 필요하다.

애플리케이션을 만들면 Discord가 봇 사용자를 함께 생성한다. 다만 **봇 토큰을 발급하거나 봇 권한을 주지는 않는다.** 슬래시 명령을 HTTP Interactions로 받으면 Gateway 연결이 필요하지 않고, 명령 등록도 OAuth2 client credentials로 처리한다. 이 애플리케이션의 설치 권한은 `permissions=0`이라 메시지 읽기나 채널 접근 권한이 없다.

**애플리케이션은 운영 서버에 설치해야 한다.** 길드 전용 명령은 설치된 서버에만 등록할 수 있고, 설치 전에는 등록 API가 403(`code 50001`)을 반환한다.

## 1. Discord 애플리케이션 설정

Discord Developer Portal에서 애플리케이션을 열고 다음을 확인한다.

- **Application ID**: 슬래시 명령 등록에 사용한다. 비밀값이 아니다.
- **Public Key**: 요청 서명 검증에 사용한다. 비밀값이 아니지만 환경변수로 관리한다.
- **Client Secret**: 명령 등록에만 사용한다. 비밀값이므로 채팅·로그·커밋에 남기지 않는다.

`General Information > Interactions Endpoint URL`에 아래 주소를 입력한다.

```text
https://<배포-도메인>/api/discord/interactions
```

Discord가 저장 시점에 PING 요청을 보내 서명 검증을 확인한다. `DISCORD_PUBLIC_KEY`가 Vercel Production에 등록된 뒤에 저장해야 통과한다.

## 1-1. 운영 서버에 설치

아래 주소를 열어 운영 서버를 선택하고 승인한다. `<APPLICATION_ID>`는 Developer Portal의 Application ID다.

```text
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=applications.commands&integration_type=0
```

`scope=applications.commands`만 요청하므로 메시지 읽기·전송 권한을 부여하지 않는다. 설치하지 않으면 다음 단계의 명령 등록이 403으로 실패한다.

## 2. 환경변수

Vercel Production에 다음을 등록한다.

```dotenv
DISCORD_PUBLIC_KEY=<Application Public Key>
DISCORD_GUILD_ID=<운영 서버 ID>
DISCORD_ADMIN_ACTOR_ID=<public.profiles의 ADMIN 계정 UUID>
```

운영 서버에는 운영자 두 명만 있으므로 개인 사용자 ID 목록을 관리하지 않는다. 대신 `DISCORD_GUILD_ID`와 일치하는 서버에서 온 요청만 처리한다. 슬래시 명령을 길드 전용으로 등록하므로 다른 서버에서는 명령 자체가 보이지 않고, 길드 확인이 남아 있으면 애플리케이션이 다른 서버에 추가되더라도 조작을 막는다. DM에서 실행한 요청도 서버 정보가 없어 거절된다.

서버 ID는 Discord 개발자 모드를 켜고 서버 이름을 우클릭해 복사한다.

`DISCORD_ADMIN_ACTOR_ID`는 감사 로그의 기록 주체다. `public.profiles.role = ADMIN`인 계정이어야 하며, Discord 사용자 ID는 메타데이터로 함께 남는다. 즉 "누가 Discord에서 눌렀는지"와 "어느 관리자 권한으로 기록되는지"를 모두 추적할 수 있다.

명령 등록에만 쓰는 값은 로컬 `.env.local`에 둔다. 서버 런타임에는 필요하지 않다.

```dotenv
DISCORD_APPLICATION_ID=<Application ID>
DISCORD_CLIENT_SECRET=<OAuth2 Client Secret>
DISCORD_GUILD_ID=<운영 서버 ID·Production과 같은 값>
```

봇을 이미 만들어 두었다면 `DISCORD_CLIENT_SECRET` 대신 `DISCORD_BOT_TOKEN`을 넣어도 된다. 등록 스크립트가 둘 중 있는 값을 사용하며, Client Secret이 있으면 그쪽을 우선한다.

## 3. 슬래시 명령 등록

```bash
npm run discord:register
```

길드 전용으로 등록하므로 즉시 반영되고 다른 서버에는 노출되지 않는다. 명령을 추가·수정한 뒤에도 같은 명령을 다시 실행한다.

Client Secret을 쓰면 스크립트가 `applications.commands.update` 스코프로 짧은 수명의 토큰을 받아 등록한다. 봇 초대 링크를 만들거나 서버에 봇을 추가하는 단계가 없다.

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
- `DISCORD_GUILD_ID`와 다른 서버, 그리고 DM에서 온 요청은 거절한다.
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

명령이 "이 서버에서는 사용할 수 없는 명령입니다"로 응답하면 `DISCORD_GUILD_ID`가 실제 서버 ID와 같은지 확인한다. "감사 로그 계정이 설정되지 않았습니다"는 `DISCORD_ADMIN_ACTOR_ID`가 비어 있거나 ADMIN 프로필이 아닌 경우다.

Client Secret이나 봇 토큰이 노출되면 Developer Portal에서 즉시 재발급한다. Client Secret은 명령 등록에만 쓰므로 재발급 후 `.env.local` 값만 바꾸면 되고, 운영 중인 명령 동작에는 영향이 없다.

# Apple 로그인 설정 런북

달빛수원 웹앱에 Apple 로그인을 서비스 가능한 상태로 연결하는 절차를 정리한다.

## 확정된 식별자

| 항목 | 값 |
| --- | --- |
| Team ID | `9Q2ZLM39JN` |
| Services ID (client_id) | `team.choikkang.dalbitsuwon.web` |
| Key ID | `9W29HS3BBK` |
| 개인키 파일 | `AuthKey_9W29HS3BBK.p8` |
| Supabase 프로젝트 ref | `feifvxhltehhsugizrob` |

개인키는 저장소에 커밋하지 않는다. `.gitignore`가 `/secrets`와 `*.p8`을 제외한다.

## 1. 개인키 배치

`.p8` 파일을 저장소 내 `secrets/` 디렉터리에 두고 접근 권한을 제한한다.

```bash
mkdir -p secrets
cp ~/Downloads/AuthKey_9W29HS3BBK.p8 secrets/
chmod 600 secrets/AuthKey_9W29HS3BBK.p8
```

Apple은 `.p8` 파일을 한 번만 내려주므로 별도 비밀 저장소에도 백업한다.

## 2. 환경변수 설정

`.env.local`에 다음 값을 추가한다. 이 값들은 client secret 생성 시에만 사용하며 런타임 앱 코드는 참조하지 않는다.

```
APPLE_TEAM_ID=9Q2ZLM39JN
APPLE_SERVICE_ID=team.choikkang.dalbitsuwon.web
APPLE_KEY_ID=9W29HS3BBK
APPLE_PRIVATE_KEY_PATH=./secrets/AuthKey_9W29HS3BBK.p8
```

## 3. client secret(JWT) 생성

Apple은 OAuth client secret으로 고정 문자열이 아닌 ES256 서명 JWT를 요구한다.

```bash
npm run apple:secret
```

이 스크립트는 `.env.local`을 자동으로 읽는다. JWT를 파일·Git·채팅에 저장하지 말고, 표준 출력의 토큰만 Supabase Dashboard의 Apple provider Secret Key에 붙여 넣는다.

표준 출력으로 JWT가 나오고, 표준 오류로 만료 시각이 표시된다. 유효 기간은 최대 6개월이며 만료 전에 같은 명령으로 재발급해 Supabase에 다시 입력해야 한다. 재발급을 놓치면 Apple 로그인만 실패한다.

## 4. Apple Developer 콘솔 설정

Certificates, Identifiers & Profiles에서 Services ID `team.choikkang.dalbitsuwon.web`을 열고 Sign In with Apple을 구성한다.

- Domains and Subdomains: `feifvxhltehhsugizrob.supabase.co` (서비스 도메인을 별도로 연결하는 경우 그 도메인도 추가)
- Return URLs: `https://feifvxhltehhsugizrob.supabase.co/auth/v1/callback`

Return URL은 앱의 `/auth/callback`이 아니라 Supabase의 콜백 주소다. Supabase가 Apple 응답을 받아 세션 코드를 만든 뒤 앱의 `/auth/callback`으로 되돌린다.

## 5. Supabase 설정

Dashboard의 Authentication > Sign In / Providers > Apple에서 다음을 입력한다.

- Client IDs: `team.choikkang.dalbitsuwon.web`
- Secret Key: 3단계에서 생성한 JWT

Authentication > URL Configuration에서 Site URL과 Redirect URLs에 서비스 도메인의 `/auth/callback`을 등록한다. 로컬 개발용으로 `http://localhost:3000/auth/callback`도 함께 등록한다. Apple Developer의 Return URL은 앱 callback이 아니라 위 Supabase callback이다.

`APPLE_*` 환경변수와 `.p8` 개인키는 client secret JWT를 생성할 때만 사용한다. Vercel 런타임에 개인키를 업로드하지 말고, 생성된 JWT만 Supabase Apple provider의 Secret Key에 입력한다. Apple client secret은 최대 6개월까지만 유효하므로 만료 전에 재발급한다.

## 6. 데이터베이스 마이그레이션

`supabase/migrations/20260730120000_create_profiles_and_apple_auth.sql`을 적용한다.

```bash
supabase db push
```

이 마이그레이션은 다음을 처리한다.

- `public.profiles` 테이블 생성. `src/app/actions/kto.ts`의 관리자 권한 검증이 이 테이블의 `role`을 읽는다.
- 신규 가입 시 프로필 자동 생성 트리거. Apple은 이름을 최초 1회만 전달하므로 가입 시점에 저장한다.
- 일반 사용자의 `role` 변경 차단 트리거.
- 기존 사용자 프로필 보정.

관리자 지정은 서비스 역할 권한으로 직접 수행한다.

```sql
update public.profiles set role = 'admin' where email = '<관리자 이메일>';
```

`role` 변경 차단 트리거는 일반 사용자 경로에만 적용되며, 위 구문은 SQL Editor의 서비스 권한으로 실행한다.

## 7. Apple 심사 대응 유의사항

- Apple은 이메일을 private relay 주소로 전달할 수 있다. 이메일을 고유 식별자로 쓰지 않고 `auth.users.id`를 기준으로 사용한다.
- 이름과 이메일은 최초 인증 1회만 전달된다. 재로그인 시에는 오지 않으므로 가입 시점 저장이 필수다.
- 계정 삭제 경로는 `/account` 페이지에 구현했다. `deleteAccount` Server Action이 service role 권한으로 `auth.users` 행을 삭제하고, `public.profiles`는 `on delete cascade`로 함께 정리된다.

## 코드 변경 요약

| 파일 | 역할 |
| --- | --- |
| `scripts/generate-apple-client-secret.ts` | ES256 서명 client secret JWT 생성. Node 내장 crypto만 사용한다. |
| `supabase/migrations/20260730120000_create_profiles_and_apple_auth.sql` | `public.profiles`, 가입 트리거, role 변경 차단 트리거 생성 |
| `src/app/actions/auth.ts` | Apple에 `name email` 스코프 요청, `deleteAccount` 추가 |
| `src/app/auth/callback/route.ts` | POST(form_post) 대응, 오픈 리다이렉트 방지, 실패 리다이렉트 정리 |
| `src/app/account/page.tsx` | 계정 정보 확인과 탈퇴 진입 경로 |
| `src/components/auth/delete-account-button.tsx` | 2단계 확인 후 계정 삭제 |
| `src/components/auth/social-login-buttons.tsx` | Apple 로고를 인라인 SVG로 교체 |
| `src/components/landing-client.tsx` | 로그인 실패/탈퇴 완료 알림, 계정 설정 링크 |

## 8. 검증

```bash
npm run typecheck
npm run lint
npm run build
npm run dev
```

개발 서버에서 확인할 항목은 다음과 같다.

1. 홈에서 Apple로 시작하기 클릭 시 `appleid.apple.com`으로 이동한다.
2. 인증 후 `/auth/callback`을 거쳐 홈으로 돌아오고 상단에 사용자 상태가 표시된다.
3. 실패 시 홈에 `auth-error` 배너가 표시된다.
4. `public.profiles`에 해당 사용자 행이 생성된다.

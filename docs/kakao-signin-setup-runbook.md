# Kakao 로그인 설정 런북

달빛수원은 Kakao OAuth를 Supabase Auth를 통해 사용한다. 앱 코드가 로그인 후 이동하는 주소와 Kakao 개발자 콘솔에 등록하는 주소가 서로 다르다는 점이 핵심이다.

## 현재 프로젝트 주소

| 항목 | 값 |
| --- | --- |
| Supabase 프로젝트 ref | `feifvxhltehhsugizrob` |
| Supabase OAuth callback | `https://feifvxhltehhsugizrob.supabase.co/auth/v1/callback` |
| 로컬 앱 callback | `http://localhost:3000/auth/callback` |

`src/app/actions/auth.ts`는 `NEXT_PUBLIC_SITE_URL` 뒤에 `/auth/callback`을 붙여 `redirectTo`를 만든다. 따라서 로컬에서는 `.env.local`의 값을 다음처럼 둔다.

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 1. Kakao Developers 설정

Kakao Developers에서 앱을 선택한 뒤 다음을 설정한다.

1. `앱 설정 > 앱 키`에서 REST API 키를 확인한다.
2. `제품 설정 > 카카오 로그인`을 활성화한다.
3. `제품 설정 > 카카오 로그인 > Redirect URI`에 아래 주소를 추가한다.

```text
https://feifvxhltehhsugizrob.supabase.co/auth/v1/callback
```

여기에는 `http://localhost:3000/auth/callback`을 등록하지 않는다. Kakao가 직접 호출하는 콜백은 Supabase Auth의 콜백이기 때문이다.

필요하다면 `동의항목`에서 이메일을 선택 동의 또는 필수 동의로 활성화한다. 이메일을 받지 않아도 로그인 자체는 가능하지만, 앱에서 이메일 기반 프로필 표시를 기대한다면 동의항목과 개인정보 보호 문구를 함께 확인한다.

Client Secret을 사용하는 경우 Kakao의 `Client Secret`을 발급하고, 사용하지 않는 경우 REST API 키만으로 Supabase 설정을 진행한다. 키 값은 Git이나 채팅에 저장하지 않는다.

## 2. Supabase Auth 설정

Supabase Dashboard의 `Authentication > Providers > Kakao`에서 다음을 입력한다.

- Client ID: Kakao REST API 키
- Client Secret: Kakao에서 발급한 Client Secret (사용 설정한 경우)

`Authentication > URL Configuration`에는 앱 callback을 허용 목록으로 추가한다.

```text
http://localhost:3000/auth/callback
https://<배포-도메인>/auth/callback
```

`<배포-도메인>`은 실제 Vercel Production 도메인으로 바꾼다. Preview 도메인에서도 테스트할 때만 해당 Preview 도메인을 추가한다. `redirectTo`가 허용 목록과 정확히 일치하지 않으면 Supabase가 리다이렉트를 거부한다.

## 3. Vercel 환경변수

Vercel의 Production 환경에는 다음처럼 설정한다.

```dotenv
NEXT_PUBLIC_SITE_URL=https://<배포-도메인>
NEXT_PUBLIC_SUPABASE_URL=https://feifvxhltehhsugizrob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
```

GitHub Actions Secrets와 Vercel 환경변수는 별도 저장소이므로 자동으로 복사되지 않는다. Kakao 키는 서버에서만 필요한 값으로 관리하고 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

## 로컬 Supabase를 사용하는 경우

현재 앱은 로컬에서 실행해도 원격 Supabase 프로젝트 `feifvxhltehhsugizrob`를 사용한다. Supabase CLI로 Auth까지 로컬 실행하는 별도 구성일 때만 Kakao Redirect URI를 `http://localhost:54321/auth/v1/callback`으로 추가한다.

## 확인 순서

1. 로컬에서 `npm run dev`를 실행한다.
2. Kakao 로그인 버튼을 누르면 `kauth.kakao.com`으로 이동하는지 확인한다.
3. 동의 후 `http://localhost:3000/auth/callback`을 거쳐 홈으로 돌아오는지 확인한다.
4. Supabase Dashboard의 `Authentication > Users`에 사용자가 생성되는지 확인한다.

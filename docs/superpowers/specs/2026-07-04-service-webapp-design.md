# 달빛수원 서비스형 웹앱 전환 설계

## 목표

현재 랜딩 중심 화면을 KTO 관광콘텐츠랩 실데이터 기반의 서비스형 웹앱으로 확장한다. 사용자는 코스 목록에서 야간 코스를 고르고, 코스에 포함된 스팟 상세를 확인하며, 관리자는 적재된 KTO 스팟 상태를 운영 관점에서 볼 수 있어야 한다.

## 범위

- `/courses`: 서비스형 코스 목록 페이지
- `/places/[slug]`: KTO 적재 스팟 상세 페이지
- 홈 랜딩: 실제 링크와 KTO 스팟/코스 CTA 연결
- `/admin`: 하드코딩 통계 대신 KTO 콘텐츠 운영 대시보드

## 데이터 흐름

Supabase REST Data API는 `public.v_imported_places`를 읽는다. 이 뷰는 `serving.v_imported_places`의 공개 별칭이며, 원천 데이터는 `core`, 운영 문구는 `editorial`, 앱 조회는 `public/serving` 계층으로 분리한다.

## 화면 설계

### 코스 목록

1. 성곽 야경 입문 코스
   - 실제 적재된 5개 KTO 스팟을 연결한다.
   - 연무대, 동북공심돈, 봉돈, 수원 지동벽화마을, 수원통닭거리를 표시한다.
2. 사진 중심 코스
   - 방화수류정, 화홍문, 용연 등 자체 운영 데이터가 필요한 후보로 표시한다.
3. 로컬 상권 연결 코스
   - 수원통닭거리와 행궁동 상권 확장 방향을 보여준다.

### 스팟 상세

`slug`로 `public.v_imported_places`를 조회한다. 이미지, 주소, 소개 문구, KTO contentId, 코스 CTA를 표시한다. 존재하지 않는 slug는 `notFound()`로 처리한다.

### 관리자

관리자 대시보드는 실제 KTO 적재 상태를 보여준다.

- 공개 스팟 수
- hero 이미지 보유 수
- KTO contentId 보유 수
- 스팟별 이미지/주소/소개 상태

## 오류 처리

- Supabase 조회 실패 시 사용자 화면은 빈 화면 대신 안내 카드를 보여준다.
- 상세 페이지에서 slug가 없으면 404로 처리한다.
- 관리자 페이지는 로그인 사용자만 접근한다.

## 검증

- `npm run kto:verify`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

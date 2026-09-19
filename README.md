# 달빛수원 웹·운영 콘솔

달빛수원 모바일 앱을 보조하는 공개 홍보 웹과 운영자용 데이터 검수 콘솔이다. 앱과 웹은 한국관광공사·기상청·경기도 공공데이터를 서버에서 수집한 뒤 Supabase의 공개 RPC/serving contract로만 제공한다. TourAPI를 브라우저에서 직접 호출하지 않는다.

## 승인 API 운영

현재 승인·신청된 API는 14건이며, 원격 ops.api_registry에 만료일·작업명·freshness SLA·검수정책을 함께 관리한다. 실데이터 검수 결과는 [승인 API 실데이터 검수 보고서](docs/approved-api-ingestion-review-2026-09-20.md), 모바일 앱 필드 계약은 [공개 관광 데이터 계약](docs/public-api-contract.md)에 기록돼 있다.

두 동기화 workflow를 구분한다.

- KTO data sync: content, events, crowd, pet, access, audio
- Approved public data sync: photo, wellness, local_hub, related, durunubi, visitors, weather_short, weather_mid, bus_arrival

수동 실행은 두 workflow 모두 dry-run과 양의 정수 limit을 지원한다. dry-run은 원천 조회·검수만 하고 DB에 저장하지 않는다. 빈 정상 응답은 zero_result=true로 기록하며 실패로 취급하지 않는다. 두루누비의 수원 0건은 현재 healthy zero이고, 버스는 승인 정류장 매핑 0건이라 hold 상태다.

## 서버 전용 키

KTO_SERVICE_KEY는 호환 fallback이고, 신규 public-data 작업은 KMA_SERVICE_KEY, GG_BUS_SERVICE_KEY를 제공처별로 우선 사용한다. NEXT_PUBLIC_*에는 서비스 키를 넣지 않는다. 로컬 검증은 다음처럼 환경 파일을 Node 프로세스에만 주입한다.

```bash
node --env-file=../../.env.local node_modules/tsx/dist/cli.mjs scripts/sync-public-data.ts --job weather_short --dry-run --limit 2
```

운영 절차·cron·secret 등록은 [GitHub Actions 데이터 동기화 런북](docs/github-actions-data-sync-runbook.md), 기존 KTO 수집 절차는 [KTO 콘텐츠 적재 런북](docs/kto-content-ingestion-runbook.md)을 따른다.

## 개발

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

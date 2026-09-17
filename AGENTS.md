<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 프로젝트 역할과 우선순위

- 이 저장소의 웹은 주 서비스 앱이 아니다. 웹의 주 역할은 **달빛수원 앱을 홍보하는 공개 웹사이트**와 **운영자가 콘텐츠·데이터를 관리하기 편한 관리자 콘솔**이다.
- 제품의 주 목적과 핵심 사용자 경험은 모바일 앱에 있다. 웹 기능을 추가하거나 수정할 때도 앱을 보조하는 홍보·관리·검증 화면이라는 전제를 유지한다.
- 모바일 앱은 별도 저장소에서 친구가 개발 중이다: [ChoiKkang/MoonSuwonApp](https://github.com/ChoiKkang/MoonSuwonApp)
- API, 인증, 데이터베이스 스키마, 동기화 계약을 변경할 때는 웹만 편하게 만드는 방향보다 모바일 앱과의 호환성과 공통 데이터 계약을 우선 검토한다.
- 앱 전용 비즈니스 로직을 웹에 중복 구현하거나 웹을 앱의 대체품처럼 확장하지 않는다. 앱 저장소를 수정하거나 앱과의 계약을 바꿔야 하는 작업은 사용자가 명시적으로 요청한 경우에만 진행한다.

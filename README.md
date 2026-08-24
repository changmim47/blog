# Daily Memorylog

Next.js App Router와 Supabase를 사용하는 개인 블로그입니다. 공개 게시글은 서버에서 조회하고 렌더링하므로 제목, 설명, 본문, canonical, JSON-LD가 최초 HTML 응답에 포함됩니다.

## Local development

1. `.env.example`을 `.env.local`로 복사하고 Supabase 공개 설정을 입력합니다.
2. `npm install` 후 `npm run dev`를 실행합니다.

프로덕션과 동일한 실행 방식은 `npm run build` 후 `npm start`입니다.

## Render

- Service type: Web Service
- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/`

필수 환경 변수는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`입니다. 기존 anon JWT를 사용하는 프로젝트는 두 번째 변수 대신 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용할 수 있습니다.

`sitemap.xml`과 `rss.xml`은 Supabase의 `published=true` 게시글을 기준으로 5분마다 재검증되며 사이트 재배포를 요구하지 않습니다.

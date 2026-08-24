# Daily Memorylog Next.js 마이그레이션 보고서

## 결과

- Next.js 16.3.2 App Router로 이전했습니다.
- 공개 게시글 `/p/[id]`는 서버에서 Supabase를 조회하고 최초 HTML에 metadata, h1, article 본문, JSON-LD를 포함합니다.
- 존재하지 않는 게시글은 Next.js `notFound()`를 통해 HTTP 404를 반환합니다.
- `published=false`는 공개 쿼리와 sitemap/RSS에서 제외되며, 관리자 쿠키 세션으로만 조회를 시도합니다.
- 홈과 섹션 첫 페이지도 서버에서 게시글과 내부 링크를 렌더링합니다.

## 주요 신규 파일

- `app/layout.tsx`: 전역 metadata, 브랜드, AdSense, 공통 App Shell
- `app/p/[id]/page.tsx`: 게시글 SSR, generateMetadata, JSON-LD, 404
- `app/sitemap.ts`: 발행 게시글 기반 동적 sitemap, 5분 재검증
- `app/robots.ts`: 공개 허용 및 관리자 경로 차단
- `app/rss.xml/route.ts`: 발행 게시글 기반 RSS, 5분 재검증
- `src/services/postsServer.ts`: 빌드 시 발행 글 조회
- `src/services/supabasePublic.ts`: 빌드 시 공개 조회 클라이언트
- `src/components/AppShell.tsx`: 기존 내비게이션, 검색, 인증, 푸터 UI
- `.github/workflows/rebuild-site.yml`: 발행 후 재빌드 수동 트리거

## 정적 익스포트 전환 시 변경분

- `next.config.ts`: `output: 'export'` 적용, `redirects()` 제거(서버 없음 → Render 규칙)
- `app/p/[id]/page.tsx`: `force-dynamic` → `generateStaticParams` + `dynamicParams = false`
- `app/robots.ts`, `app/sitemap.ts`, `app/rss.xml`, `app/ads.txt`: `dynamic = 'force-static'`
- `revalidate = 300` 전부 제거 (정적 익스포트에서는 재빌드가 갱신 수단)
- `app/admin/layout.tsx`, `app/drafts/page.tsx`: `force-dynamic` 제거
- `/edit/[id]` → `/edit?id=...` (정적 익스포트는 미리 알 수 없는 동적 세그먼트를 만들 수 없음)
- `Editor`를 `Suspense`로 감쌈 (`useSearchParams` 정적 프리렌더 요구사항)
- `proxy.ts`, `src/services/supabaseServer.ts` 삭제 (쿠키 SSR 불가)
- `getPostForRequest` 제거 → `getPublishedPostById`만 사용
  - 부수효과: 초안이 빌드 산출물에 실릴 경로가 원천적으로 사라짐
- 관리자 인증은 기존대로 브라우저에서 처리 (`@supabase/ssr`의 `createBrowserClient` 유지)
  - SSR 쿠키 전환이 없으므로 **관리자 재로그인 불필요**

## 유지한 기능

- 기존 Tailwind 디자인과 반응형 UI
- 기존 게시글 ID와 `/p/[id]` URL
- 게시글 목록, 상세, 작성, 수정, 삭제, 발행/초안 전환
- Supabase Auth, RLS 기반 권한, Storage 이미지/오디오 업로드
- Gallery, Playlist, Blog 카테고리
- 관리자 Runs/YouTube 도구와 Supabase Edge Functions
- 좋아요, 조회수, 검색, 관련 글, RSS, AdSense 슬롯

## 삭제/대체한 파일

- Vite 진입점과 설정: `index.html`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts`
- SPA fallback: `public/_redirects`, `vercel.json`
- 빌드 시 SEO 생성: `scripts/generate-sitemap-rss.ts`
- 정적 robots: `public/robots.txt` (App Router metadata route로 대체)

## 배포 방식: 정적 익스포트 (Static Export)

SSR(Web Service) 대신 `output: 'export'` 정적 익스포트로 배포한다.

이유: Render 무료 Web Service는 15분 무요청 시 인스턴스가 내려가고 다음 요청에서
콜드 스타트에 최대 1분이 걸린다. 유입이 없는 상태에서는 Googlebot이 거의 항상
잠든 인스턴스를 만나게 되어 크롤링이 오히려 악화된다. 정적 익스포트는 CDN에서
즉시 응답하고, SEO 산출물(최초 HTML의 title/description/canonical/h1/본문/JSON-LD)은
SSR과 완전히 동일하다.

### Render 설정

- Service Type: `Static Site`
- Build Command: `npm ci && npm run build`
- Publish Directory: `out`
- Redirect/Rewrite: `www.daily-memorylog.com` → `https://daily-memorylog.com` (301)
  - `next.config.ts`의 `redirects()`는 서버가 없어 동작하지 않으므로 Render 규칙으로 처리한다.

### 발행 후 재빌드 (중요)

게시글은 빌드 시점에 HTML로 생성되므로, 초안을 발행한 뒤 재빌드해야 노출된다.
`scripts/generate-post.ts`는 `published: false` 초안만 만들기 때문에
글 생성 시점이 아니라 **발행 시점**에 재빌드를 걸어야 한다.

- 권장: Supabase Database Webhook을 `posts` 테이블 UPDATE에 걸어
  Render Deploy Hook URL로 POST → 발행 즉시 자동 재빌드
- 백업: `.github/workflows/rebuild-site.yml` 수동 실행
  (GitHub Secret `RENDER_DEPLOY_HOOK_URL` 필요)
- 최후: Render 대시보드에서 Manual Deploy

필수 환경 변수:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (권장)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (기존 anon JWT를 사용할 때 위 키 대신)

선택 환경 변수:

- `NEXT_PUBLIC_ADSENSE_CLIENT`
- `NEXT_PUBLIC_ADSENSE_SLOT_BANNER`
- `NEXT_PUBLIC_ADSENSE_SLOT_INFEED`
- `NEXT_PUBLIC_ADSENSE_SLOT_RECTANGLE`
- 자동 글 스크립트용 `SUPABASE_ADMIN_EMAIL`, `SUPABASE_ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`, `UNSPLASH_ACCESS_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BLOG_BASE_URL`

Render의 기존 Static Site가 아니라 Web Service를 새로 사용해야 합니다. Custom Domain에 `daily-memorylog.com`을 연결하고 HTTP→HTTPS 및 `www`→non-www 리다이렉트를 확인합니다.

## 검증 결과 (정적 익스포트)

- `npx tsc --noEmit`: 성공
- `npm run build`: 성공 — 정적 페이지 61개, 게시글 42개 전부 프리렌더
- `out/` 산출물: `404.html`, `sitemap.xml`(47 URL), `rss.xml`(20 item), `robots.txt` 생성 확인
- 초안 유출 검사: `out/` 안에 `published=false` 게시글 없음
- 게시글 최초 HTML에 title, description, canonical, h1, OG, JSON-LD, 본문 포함 확인
- 로컬 정적 서버 라우팅:
  - `/`, `/blog`, `/gallery`, `/playlist`, `/about`, `/p/:id` → 200
  - `/sitemap.xml`, `/rss.xml`, `/robots.txt` → 200
  - 없는 게시글, 없는 경로 → 404 (브랜드 404 페이지)

로컬 검증 방법:

```bash
npm run build && npm run preview
```

```bash
curl -i http://localhost:3000/p/auto-1787268622309
```

## 배포 전 외부 확인

- Supabase RLS SQL은 저장소에 없으므로 anon 사용자가 `published=false`를 읽거나 쓰지 못하는지 대시보드에서 확인해야 합니다.
  (정적 익스포트에서는 빌드가 발행 글만 조회하므로 초안 유출 경로는 없지만, 쓰기 권한 확인은 여전히 필요합니다.)
- DB에 수정일 컬럼이 확인되지 않아 `dateModified`와 sitemap `lastModified`는 수정일 필드가 있으면 사용하고, 없으면 `createdAt`을 사용합니다.
- 브라우저 점검 중 기존 `increment_visit` RPC에서 `date` 컬럼에 text 값을 넣는 Supabase 함수 오류가 확인됐습니다. 방문자 통계 함수의 SQL에서 `CURRENT_DATE` 등 date 타입을 사용하도록 별도 수정이 필요합니다.
- 배포 후 Google Search Console에서 sitemap을 다시 제출하고 실제 게시글 URL 검사를 실행합니다.

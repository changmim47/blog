import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 정적 익스포트: 빌드 시 모든 페이지를 out/ 아래 HTML로 생성한다.
  // Render Static Site로 배포하므로 서버 런타임(콜드 스타트)이 없다.
  output: 'export',
  poweredByHeader: false,
  images: { unoptimized: true },
  // www -> non-www 리다이렉트는 서버가 없으므로 Render Redirect 규칙으로 처리한다.
};

export default nextConfig;

import { NextResponse } from 'next/server';

// 빌드 시 out/ads.txt 파일로 생성된다.
// 정적 파일이라 상태 코드를 조건부로 바꿀 수 없으므로, AdSense 미설정 시에는 빈 파일이 된다.
// AdSense 활성화 시 NEXT_PUBLIC_ADSENSE_CLIENT를 설정하고 재빌드하면 내용이 채워진다.
export const dynamic = 'force-static';

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const body = client
    ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`
    : '';

  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

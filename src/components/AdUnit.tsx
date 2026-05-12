import React, { useEffect, useRef } from 'react';

/**
 * Google AdSense 광고 슬롯.
 *
 * 활성화 단계:
 *   1) AdSense 가입 → publisher ID 발급 (예: ca-pub-1234567890123456)
 *   2) 환경변수 VITE_ADSENSE_CLIENT 설정 → 사이트에 AdSense 스크립트 로드
 *      - 이 단계만 해도 심사 신청 가능 (스크립트 통합 검증)
 *   3) 심사 통과 후 AdSense 대시보드에서 광고 단위 생성 → slot ID 발급
 *   4) 환경변수 VITE_ADSENSE_SLOT_BANNER / _INFEED / _RECTANGLE 설정
 *      - 이때부터 실제 광고가 슬롯에 채워짐
 *
 * publisher ID나 slot ID 없으면 깨끗하게 nothing 렌더 (UX 보호).
 */

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
const AD_SLOTS: Record<string, string | undefined> = {
  banner: import.meta.env.VITE_ADSENSE_SLOT_BANNER,
  'in-feed': import.meta.env.VITE_ADSENSE_SLOT_INFEED,
  rectangle: import.meta.env.VITE_ADSENSE_SLOT_RECTANGLE,
};

interface AdUnitProps {
  type?: 'banner' | 'in-feed' | 'rectangle';
  className?: string;
}

const AdUnit: React.FC<AdUnitProps> = ({ type = 'banner', className = '' }) => {
  const slot = AD_SLOTS[type];
  const pushed = useRef(false);

  useEffect(() => {
    if (!AD_CLIENT || !slot) return;
    if (pushed.current) return;
    try {
      // adsbygoogle queue에 push → AdSense가 이 슬롯 채움
      const w = window as unknown as { adsbygoogle?: Array<Record<string, unknown>> };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      pushed.current = true;
    } catch (e) {
      console.error('AdSense push failed:', e);
    }
  }, [slot]);

  // publisher ID 또는 slot ID 미설정 → 렌더 안 함 (활성화 전 깨끗한 UX)
  if (!AD_CLIENT || !slot) return null;

  return (
    <div className={`w-full flex justify-center my-6 ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format={type === 'rectangle' ? 'rectangle' : 'auto'}
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default AdUnit;

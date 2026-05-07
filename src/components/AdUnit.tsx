
import React from 'react';

interface AdUnitProps {
  type?: 'banner' | 'in-feed' | 'rectangle';
  className?: string;
}

const AdUnit: React.FC<AdUnitProps> = ({ type = 'banner', className = '' }) => {
  // -------------------------------------------------------------------------
  // [광고 설정]
  // 나중에 구글 애드센스 승인을 받은 후, 아래 값을 true로 변경하면 광고가 나타납니다.
  // -------------------------------------------------------------------------
  const SHOW_ADS = false; 

  if (!SHOW_ADS) {
    return null;
  }

  // Layout styling based on type
  const getSizeClass = () => {
    switch (type) {
      case 'in-feed':
        return 'h-32 md:h-40';
      case 'rectangle':
        return 'h-64 w-full md:w-80'; // Sidebar style
      case 'banner':
      default:
        return 'h-24 md:h-28';
    }
  };

  return (
    <div className={`w-full flex justify-center my-6 ${className}`}>
      {/* AdSense Placeholder Container */}
      <div className={`w-full bg-slate-100 border border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 overflow-hidden relative ${getSizeClass()}`}>
        
        {/* Visual Decoration for Placeholder */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]"></div>
        
        <span className="text-xs font-semibold tracking-widest uppercase mb-1 z-10">Advertisement</span>
        <span className="text-[10px] text-slate-300 z-10">(Google AdSense Area)</span>
        
        {/* 
            TODO: 실제 적용 시 아래 주석을 해제하고 위쪽의 UI 코드를 지우거나 조건부 렌더링하세요.
            
            <ins className="adsbygoogle"
                 style={{ display: 'block' }}
                 data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                 data-ad-slot="YOUR_AD_SLOT_ID"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
            <script>
                 (adsbygoogle = window.adsbygoogle || []).push({});
            </script>
        */}
      </div>
    </div>
  );
};

export default AdUnit;

import React from 'react';
import { AUTHOR, SITE } from '../constants/author';

const PrivacyPolicy: React.FC = () => {
  const lastUpdated = '2026-05-16';

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 md:py-20 animate-fade-in">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-serif font-bold text-slate-900 mb-4">개인정보처리방침</h1>
        <p className="text-slate-500 text-sm">최종 업데이트: {lastUpdated}</p>
      </header>

      <div className="prose prose-slate max-w-none prose-headings:font-serif prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline">
        <p>
          본 사이트(<strong>{SITE.name}</strong>, <a href={SITE.url}>{SITE.url}</a>, 이하 "사이트")는 방문자의 개인정보를 중요하게 생각합니다.
          본 개인정보처리방침은 사이트가 어떤 정보를 수집하고, 어떻게 사용하는지를 설명합니다.
        </p>

        <h3>1. 수집하는 정보</h3>
        <p>사이트는 다음 정보를 자동으로 수집할 수 있습니다:</p>
        <ul>
          <li>접속 IP 주소, 브라우저 종류 및 버전, 운영체제</li>
          <li>방문한 페이지 URL, 방문 시각, 머무른 시간, 유입 경로(referrer)</li>
          <li>방문자 통계용 익명 카운트 (Supabase의 <code>visitor_stats</code> 테이블)</li>
          <li>각 글의 조회수 (개인을 식별하지 않는 집계 형태)</li>
        </ul>
        <p>
          별도 회원가입은 없으며, 이름·이메일 등 식별 정보는 수집하지 않습니다.
          관리자 본인의 인증 세션만 별도로 관리됩니다.
        </p>

        <h3>2. 쿠키 및 로컬 스토리지 사용</h3>
        <p>사이트는 다음 목적으로 쿠키 및 브라우저 스토리지를 사용합니다:</p>
        <ul>
          <li><strong>세션 스토리지</strong>: 같은 세션 내 중복 방문 카운트 방지, 좋아요 중복 방지</li>
          <li><strong>로컬 스토리지</strong>: 좋아요한 글 기억, 관리자 인증 세션 유지</li>
          <li><strong>제3자 쿠키</strong>: 아래 광고 파트너가 자체 쿠키를 사용할 수 있음</li>
        </ul>
        <p>
          브라우저 설정에서 쿠키를 비활성화하거나 삭제할 수 있습니다.
          단, 일부 기능(좋아요, 관리자 로그인)이 정상 동작하지 않을 수 있습니다.
        </p>

        <h3>3. Google AdSense 및 광고</h3>
        <p>
          사이트는 Google AdSense를 통해 광고를 게재할 수 있습니다. Google 및 광고 파트너는 다음을 위해 쿠키를 사용합니다:
        </p>
        <ul>
          <li>방문자가 사이트 또는 다른 사이트를 방문한 기록을 기반으로 한 맞춤형 광고 게재</li>
          <li>광고 효과 측정 및 사기성 클릭 방지</li>
          <li>방문자의 IP 주소, 사용자 에이전트, 위치 정보(국가·지역 단위) 수집</li>
        </ul>
        <p>
          Google이 광고 게재에 쿠키를 사용하는 방식에 대한 자세한 내용은 다음을 참고하세요:{' '}
          <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">
            Google 광고 및 콘텐츠 네트워크 개인정보처리방침
          </a>
        </p>
        <p>
          맞춤형 광고를 원하지 않으시면 다음 페이지에서 광고 개인화 설정을 변경할 수 있습니다:{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
            Google 광고 설정
          </a>
        </p>

        <h3>4. 제3자 광고 서버</h3>
        <p>
          제3자 광고 서버나 광고 네트워크는 사이트에 표시되는 광고나 링크에서 쿠키, JavaScript, 웹 비콘과 같은 기술을 사용합니다.
          이러한 기술이 사용될 때 방문자의 IP 주소가 자동으로 전송될 수 있습니다.
          이는 광고 효과 측정 및 광고 개인화 목적으로 사용됩니다.
        </p>
        <p>
          사이트는 제3자 광고주가 사용하는 쿠키에 접근하거나 통제할 수 없습니다.
          각 광고 파트너의 개인정보처리방침은 해당 파트너의 사이트에서 확인하시기 바랍니다.
        </p>

        <h3>5. 데이터 보관 및 삭제</h3>
        <p>
          방문자 통계는 집계 형태로만 보관되며 개인을 식별하지 않습니다.
          좋아요한 글 정보는 방문자의 브라우저에만 저장되며, 브라우저 데이터를 지우면 함께 삭제됩니다.
          블로그 게시글은 운영자가 삭제하지 않는 한 무기한 보관됩니다.
        </p>

        <h3>6. 외부 링크</h3>
        <p>
          사이트는 다른 웹사이트로 향하는 링크를 포함할 수 있습니다.
          이러한 외부 사이트의 콘텐츠나 개인정보 처리 방식에 대해서는 책임지지 않습니다.
          외부 사이트 방문 시 해당 사이트의 개인정보처리방침을 별도로 확인하시기 바랍니다.
        </p>

        <h3>7. 만 14세 미만 아동의 개인정보</h3>
        <p>
          사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 의도적으로 해당 연령대의 정보를 수집하지 않습니다.
        </p>

        <h3>8. 정책 변경</h3>
        <p>
          본 개인정보처리방침은 법률 및 서비스 변경 사항을 반영하여 수정될 수 있습니다.
          변경 사항은 본 페이지에 게시되며, 상단의 "최종 업데이트" 날짜로 변경 시점을 확인할 수 있습니다.
        </p>

        <h3>9. 문의</h3>
        <p>
          본 방침에 관한 문의는 다음 이메일로 연락해 주세요:{' '}
          <a href={`mailto:${AUTHOR.email}`}>{AUTHOR.email}</a>
        </p>

        <h3>10. 동의</h3>
        <p>
          사이트를 이용함으로써 본 개인정보처리방침에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

import type { Metadata } from 'next';
import PrivacyPolicy from '../../src/components/PrivacyPolicy';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}

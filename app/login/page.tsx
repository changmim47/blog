import type { Metadata } from 'next';
import LoginPageClient from '../../src/components/LoginPageClient';

export const metadata: Metadata = {
  title: '관리자 로그인',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginPageClient />;
}

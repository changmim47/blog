import type { Metadata } from 'next';
import About from '../../src/components/About';

export const metadata: Metadata = {
  title: 'About',
  description: 'Daily Memorylog와 운영자에 대한 소개입니다.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return <About />;
}

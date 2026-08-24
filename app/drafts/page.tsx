import type { Metadata } from 'next';
import DraftsPageClient from '../../src/components/DraftsPageClient';

export const metadata: Metadata = {
  title: 'Drafts',
  robots: { index: false, follow: false },
};

export default function DraftsPage() {
  return <DraftsPageClient />;
}

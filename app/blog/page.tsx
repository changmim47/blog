import SectionRoute, { sectionMetadata } from '../../src/components/SectionRoute';

export const metadata = sectionMetadata.blog;

export default function BlogPage() {
  return <SectionRoute type="blog" />;
}

import SectionRoute, { sectionMetadata } from '../../src/components/SectionRoute';

export const metadata = sectionMetadata.gallery;

export default function GalleryPage() {
  return <SectionRoute type="gallery" />;
}

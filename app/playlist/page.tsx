import SectionRoute, { sectionMetadata } from '../../src/components/SectionRoute';

export const metadata = sectionMetadata.playlist;

export default function PlaylistPage() {
  return <SectionRoute type="playlist" />;
}

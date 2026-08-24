import Dashboard from '../src/components/Dashboard';
import { getRecentPublishedPosts } from '../src/services/postsServer';

export default async function HomePage() {
  const [galleryPosts, playlistPosts, blogPosts] = await Promise.all([
    getRecentPublishedPosts('gallery', 4),
    getRecentPublishedPosts('playlist', 3),
    getRecentPublishedPosts('blog', 3),
  ]);

  return (
    <Dashboard
      galleryPosts={galleryPosts}
      playlistPosts={playlistPosts}
      blogPosts={blogPosts}
    />
  );
}

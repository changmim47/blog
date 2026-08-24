import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostDetail from '../../../src/components/PostDetail';
import { AUTHOR, SITE } from '../../../src/constants/author';
import {
  getAllPublishedPosts,
  getPublishedPostById,
  getRelatedPublishedPosts,
} from '../../../src/services/postsServer';
import type { BlogPost } from '../../../src/types';

// 빌드 시점에 발행 글만 정적 생성한다. 목록에 없는 id는 404(out/404.html).
export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = await getAllPublishedPosts();
  return posts.map((post) => ({ id: String(post.id) }));
}

type PostPageProps = { params: Promise<{ id: string }> };

function descriptionFor(post: BlogPost) {
  if (post.summary?.trim()) return post.summary.trim().slice(0, 160);
  return post.content
    .replace(/\[image-\d+\]/g, ' ')
    .replace(/[#>*_`\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function modifiedDate(post: BlogPost) {
  if (post.updated_at) return new Date(post.updated_at).toISOString();
  if (post.updatedAt) return new Date(post.updatedAt).toISOString();
  return new Date(post.createdAt).toISOString();
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublishedPostById(id);

  if (!post) {
    return { title: '게시글을 찾을 수 없음', robots: { index: false, follow: false } };
  }

  const canonical = `/p/${encodeURIComponent(post.id)}`;
  const description = descriptionFor(post);
  const image = post.coverImage ? [post.coverImage] : undefined;

  return {
    title: post.title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      locale: 'ko_KR',
      url: canonical,
      siteName: SITE.name,
      title: `${post.title} | ${SITE.name}`,
      description,
      publishedTime: new Date(post.createdAt).toISOString(),
      modifiedTime: modifiedDate(post),
      tags: post.tags,
      images: image,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${post.title} | ${SITE.name}`,
      description,
      images: image,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const post = await getPublishedPostById(id);
  if (!post) notFound();

  const relatedPosts = await getRelatedPublishedPosts(post, 3);
  const canonical = `${SITE.url}/p/${encodeURIComponent(post.id)}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: descriptionFor(post),
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: modifiedDate(post),
    image: post.coverImage ? [post.coverImage] : undefined,
    keywords: post.tags?.join(', '),
    author: {
      '@type': 'Person',
      name: AUTHOR.name,
      url: AUTHOR.url,
      description: AUTHOR.bio,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/icon.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PostDetail initialPost={post} relatedPosts={relatedPosts} />
    </>
  );
}

import 'server-only';

import { cache } from 'react';
import type { BlogPost, PostType } from '../types';
import { createPublicSupabaseClient } from './supabasePublic';

const TABLE_NAME = 'posts';

function applyTypeFilter<T>(query: T, type: PostType): T {
  if (type === 'playlist') {
    return (query as T & { or: (filter: string) => T }).or('type.eq.playlist,type.is.null');
  }
  return (query as T & { eq: (column: string, value: string) => T }).eq('type', type);
}

export async function getPublishedPostsPaginated(
  type: PostType,
  limit: number,
  offset: number,
): Promise<{ posts: BlogPost[]; hasMore: boolean }> {
  const supabase = createPublicSupabaseClient();
  let query = supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .eq('published', true);

  query = applyTypeFilter(query, type);
  const { data, error, count } = await query
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to fetch ${type} posts: ${error.message}`);
  const posts = (data ?? []) as BlogPost[];
  return {
    posts,
    hasMore: count !== null ? offset + posts.length < count : posts.length === limit,
  };
}

export async function getRecentPublishedPosts(type: PostType, limit: number) {
  const { posts } = await getPublishedPostsPaginated(type, limit, 0);
  return posts;
}

export async function getAllPublishedPosts(): Promise<BlogPost[]> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('published', true)
    .order('createdAt', { ascending: false });
  if (error) throw new Error(`Failed to fetch published posts: ${error.message}`);
  return (data ?? []) as BlogPost[];
}

export const getPublishedPostById = cache(async (id: string): Promise<BlogPost | null> => {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch post ${id}: ${error.message}`);
  return data as BlogPost | null;
});

export async function getRelatedPublishedPosts(
  post: BlogPost,
  limit = 3,
): Promise<BlogPost[]> {
  const supabase = createPublicSupabaseClient();
  let candidates: BlogPost[] = [];

  if (post.tags?.length) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .neq('id', post.id)
      .eq('published', true)
      .overlaps('tags', post.tags)
      .order('createdAt', { ascending: false })
      .limit(limit + 10);
    if (!error) candidates = (data ?? []) as BlogPost[];
  }

  if (candidates.length < limit) {
    const { posts: fallback } = await getPublishedPostsPaginated(post.type, limit + 5, 0);
    const existing = new Set([post.id, ...candidates.map((item) => item.id)]);
    fallback.forEach((item) => {
      if (!existing.has(item.id)) {
        candidates.push(item);
        existing.add(item.id);
      }
    });
  }

  return candidates
    .map((item) => ({
      item,
      overlap: (item.tags ?? []).filter((tag) => post.tags?.includes(tag)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap || b.item.createdAt - a.item.createdAt)
    .slice(0, limit)
    .map(({ item }) => item);
}

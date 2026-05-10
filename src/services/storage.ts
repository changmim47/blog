
import { supabase } from './supabaseClient';
import { BlogPost, PostType, GenerationRun } from '../types';

const TABLE_NAME = 'posts';
// 사용자가 생성한 Supabase Storage Bucket 이름으로 변경
const BUCKET_NAME = 'blogdb';

// --- Database Operations ---

export const getAllPosts = async (): Promise<BlogPost[]> => {
  // 공개 조회 — 검색 등에 사용. 초안은 RLS에서 익명에게 차단되지만 명시적으로도 필터.
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('published', true)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return data as BlogPost[];
};

export const getDraftPosts = async (): Promise<BlogPost[]> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('published', false)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('Error fetching drafts:', error);
    return [];
  }
  return data as BlogPost[];
};

export const togglePublished = async (id: string, value: boolean): Promise<void> => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ published: value })
    .eq('id', id);

  if (error) {
    console.error('Error toggling published:', error);
    throw error;
  }
  // 발행/언발행 시 Render 재빌드 트리거 → sitemap.xml 갱신
  await triggerRebuild();
};

/**
 * Render Deploy Hook을 호출해 사이트 재빌드를 트리거.
 * Supabase RPC 경유 (Deploy Hook URL은 Postgres 함수 안에 숨겨져 브라우저에 노출 안 됨).
 * 실패해도 메인 작업에는 영향 X.
 */
export const triggerRebuild = async (): Promise<void> => {
  try {
    const { error } = await supabase.rpc('trigger_render_rebuild');
    if (error) {
      console.warn('Rebuild trigger failed (non-critical):', error.message);
    }
  } catch (e) {
    console.warn('Rebuild trigger error (non-critical):', e);
  }
};

export const getGenerationRuns = async (limit = 50): Promise<GenerationRun[]> => {
  const { data, error } = await supabase
    .from('generation_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching generation runs:', error);
    return [];
  }
  return (data || []) as GenerationRun[];
};

const applyTypeFilter = <T>(query: T, type: PostType): T => {
  // 'playlist'는 레거시 데이터(type 누락)도 포함
  if (type === 'playlist') {
    return (query as any).or('type.eq.playlist,type.is.null');
  }
  return (query as any).eq('type', type);
};

export const getPostsPaginated = async (
  type: PostType,
  limit: number,
  offset: number
): Promise<{ posts: BlogPost[]; hasMore: boolean }> => {
  let query = supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .eq('published', true);

  query = applyTypeFilter(query, type);

  const { data, error, count } = await query
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching paginated posts:', error);
    return { posts: [], hasMore: false };
  }

  const posts = (data || []) as BlogPost[];
  const hasMore = count !== null ? offset + posts.length < count : posts.length === limit;
  return { posts, hasMore };
};

export const getRecentPosts = async (type: PostType, limit: number): Promise<BlogPost[]> => {
  const { posts } = await getPostsPaginated(type, limit, 0);
  return posts;
};

/**
 * 현재 글과 관련된 다른 발행글을 가져옴.
 * 1순위: 태그가 하나 이상 겹치는 글 — 겹친 태그 수가 많은 순으로 정렬
 * 폴백: 같은 type의 최신 발행글
 */
export const getRelatedPosts = async (
  currentId: string,
  tags: string[],
  type: PostType,
  limit = 3
): Promise<BlogPost[]> => {
  // 태그 없으면 같은 type의 최근 글로 폴백
  if (!tags || tags.length === 0) {
    const { posts } = await getPostsPaginated(type, limit + 1, 0);
    return posts.filter((p) => p.id !== currentId).slice(0, limit);
  }

  // 태그 겹치는 글 후보 (현재 글 제외, 발행된 것만, 같은 type 우선)
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .neq('id', currentId)
    .eq('published', true)
    .overlaps('tags', tags)
    .order('createdAt', { ascending: false })
    .limit(limit + 10);

  if (error) {
    console.error('Error fetching related posts:', error);
    return [];
  }

  let candidates = (data ?? []) as BlogPost[];

  // 후보 부족하면 같은 type의 최신글로 보충
  if (candidates.length < limit) {
    const { posts: fallback } = await getPostsPaginated(type, limit + candidates.length + 1, 0);
    const existingIds = new Set([currentId, ...candidates.map((c) => c.id)]);
    fallback.forEach((p) => {
      if (!existingIds.has(p.id) && candidates.length < limit + 5) {
        candidates.push(p);
        existingIds.add(p.id);
      }
    });
  }

  // 점수: 겹치는 태그 수 (많을수록 좋음). 동점이면 최신순.
  const ranked = candidates
    .map((p) => ({
      post: p,
      overlap: (p.tags ?? []).filter((t) => tags.includes(t)).length,
    }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return b.post.createdAt - a.post.createdAt;
    })
    .slice(0, limit);

  return ranked.map((r) => r.post);
};

export const getPostById = async (id: string): Promise<BlogPost | null> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching post:', error);
    return null;
  }
  return data as BlogPost;
};

export const savePost = async (post: BlogPost): Promise<void> => {
  // id가 없으면 생성해야 하지만, 보통 Editor에서 Date.now().toString() 등으로 임시 ID를 줍니다.
  // Supabase upsert를 사용하면 ID가 같을 경우 업데이트, 없으면 삽입합니다.
  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(post);

  if (error) {
    console.error('Error saving post:', error);
    throw error;
  }
  // 발행 상태 글 저장/수정 시 sitemap 갱신 위해 재빌드.
  // 초안(published=false)은 sitemap에 없으니 트리거 안 함.
  if (post.published) {
    await triggerRebuild();
  }
};

export const deletePost = async (id: string): Promise<void> => {
  // 1. Get post data to find associated files
  const post = await getPostById(id);
  
  if (post) {
      const filesToRemove: string[] = [];

      // Helper to extract path relative to bucket from public URL
      const extractPath = (url: string) => {
        if (!url) return null;
        // Check if the URL belongs to our bucket
        if (!url.includes(`/${BUCKET_NAME}/`)) return null; 
        
        // Split by bucket name to get the path
        // URL format: .../storage/v1/object/public/blogdb/folder/filename
        const parts = url.split(`/${BUCKET_NAME}/`);
        if (parts.length > 1) {
            // Decode URI component in case of special characters
            return decodeURIComponent(parts[1]);
        }
        return null;
      }

      // Collect files
      if (post.coverImage) {
         const path = extractPath(post.coverImage);
         if(path) filesToRemove.push(path);
      }
      if (post.audioUrl) {
         const path = extractPath(post.audioUrl);
         if(path) filesToRemove.push(path);
      }
      if (post.contentImages && Array.isArray(post.contentImages)) {
         post.contentImages.forEach(url => {
            const path = extractPath(url);
            if(path) filesToRemove.push(path);
         });
      }

      // 2. Delete files from Storage if any
      if (filesToRemove.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove(filesToRemove);
        
        if (storageError) {
            console.error('Error removing files from storage:', storageError);
            // We continue to delete the post even if file deletion fails
        }
      }
  }

  // 3. Delete row from DB
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
  // 발행됐던 글이 삭제되면 sitemap에서도 빠져야 하므로 재빌드.
  // (초안 삭제도 트리거되지만 빈도 낮고 문제 없음)
  if (post && post.published !== false) {
    await triggerRebuild();
  }
};

export const updatePostLikes = async (id: string, likes: number): Promise<void> => {
    const { error } = await supabase
        .from(TABLE_NAME)
        .update({ likes: likes })
        .eq('id', id);

    if (error) {
        console.error('Error updating likes:', error);
        throw error;
    }
};

// --- Visitor Stats Operations ---

/**
 * User-Agent 기반 봇 탐지. 검색엔진/스크래퍼/링크 미리보기 봇은 카운트에서 제외.
 */
const isBotUserAgent = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  const ua = (navigator.userAgent || '').toLowerCase();
  if (!ua) return true;
  return /bot|crawl|spider|slurp|google-?(?:bot|other)|bingbot|yandex|duckduckbot|baidu|sogou|exabot|facebookexternalhit|twitterbot|linkedinbot|embedly|whatsapp|telegram|discord|slack|preview|prerender|headlesschrome|phantomjs|lighthouse|chrome-lighthouse/i.test(ua);
};

export const recordVisit = async (): Promise<void> => {
  if (isBotUserAgent()) return;
  const { error } = await supabase.rpc('increment_visit');
  if (error) {
    console.error('Error recording visit:', error.message);
  }
};

/**
 * 한 글당 한 세션에 1회만 카운트. 같은 사람이 새로고침해도 1회.
 */
export const recordPostView = async (postId: string): Promise<void> => {
  if (!postId) return;
  if (isBotUserAgent()) return;
  // 세션별 dedup
  const sessionKey = `viewed_${postId}`;
  if (sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, '1');

  const { error } = await supabase.rpc('increment_post_view', { post_id_param: postId });
  if (error) {
    console.error('Error recording post view:', error.message);
  }
};

export const getVisitorStats = async (): Promise<{ today: number, total: number }> => {
  const today = new Date().toISOString().split('T')[0];

  // 1. Get Total (Sum of all counts)
  const { data: allData } = await supabase
    .from('visitor_stats')
    .select('count');
  
  const total = allData?.reduce((acc, curr) => acc + (curr.count || 0), 0) || 0;

  // 2. Get Today
  const { data: todayData } = await supabase
    .from('visitor_stats')
    .select('count')
    .eq('date', today)
    .maybeSingle();
    
  return {
    today: todayData?.count || 0,
    total: total
  };
};

// --- Storage Operations ---

export const uploadFile = async (file: File, folder: 'images' | 'audio'): Promise<string> => {
  // 파일명에 한글이나 특수문자가 있으면 오류가 날 수 있으므로 안전하게 처리
  const fileExt = file.name.split('.').pop();
  // 폴더 구조: blogdb 버킷 내부의 images 폴더 또는 audio 폴더
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file);

  if (error) {
    console.error('Upload error details:', error);
    throw error;
  }

  // Get Public URL
  // 주의: Supabase Storage 설정에서 'blogdb' 버킷이 Public으로 설정되어 있어야 합니다.
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
};

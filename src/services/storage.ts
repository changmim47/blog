
import { supabase } from './supabaseClient';
import { BlogPost } from '../types';

const TABLE_NAME = 'posts';
// 사용자가 생성한 Supabase Storage Bucket 이름으로 변경
const BUCKET_NAME = 'blogdb';

// --- Database Operations ---

export const getAllPosts = async (): Promise<BlogPost[]> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
  return data as BlogPost[];
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

export const recordVisit = async (): Promise<void> => {
  // Try using RPC function 'increment_visit' first (Atomic increment)
  const { error } = await supabase.rpc('increment_visit');
  
  if (error) {
    // If RPC fails (function not created), fallback to client-side logic
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Check if row exists
    const { data: existing } = await supabase
      .from('visitor_stats')
      .select('count')
      .eq('date', today)
      .maybeSingle();

    const currentCount = existing ? existing.count : 0;
    
    // 2. Upsert
    await supabase
      .from('visitor_stats')
      .upsert({ date: today, count: currentCount + 1 });
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

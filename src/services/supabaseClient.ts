import { createClient } from '@supabase/supabase-js';

// TODO: Supabase 대시보드 -> Settings -> API 에서 URL과 Anon Key를 복사해서 아래에 입력하세요.
const SUPABASE_URL = 'https://gqhzlphlxoanqadthcgs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaHpscGhseG9hbnFhZHRoY2dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxMzQxMzAsImV4cCI6MjA3OTcxMDEzMH0.3AjVLuuzFc8SiQaLN9lwXjnuLwSHy0RKAXnKVU-hinw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 간단한 연결 테스트 헬퍼
export const checkConnection = async () => {
  try {
    if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
      return false; // 설정이 안 됨
    }
    const { error } = await supabase.from('posts').select('id').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
};
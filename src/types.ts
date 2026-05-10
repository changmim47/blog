
export type PostType = 'playlist' | 'gallery' | 'blog';

export interface BlogPost {
  id: string;
  type: PostType;
  title: string;
  content: string;
  summary: string;
  createdAt: number;
  tags: string[];
  coverImage?: string;       // 목록 썸네일 & 헤더 배경
  contentImages?: string[];  // 본문 삽입 이미지들 (여러 장)
  contentImage?: string;     // @deprecated 레거시(단일 이미지) 호환용
  audioUrl?: string;
  likes?: number;            // 좋아요 수
  view_count?: number;       // 조회수
  published?: boolean;       // false면 초안 (관리자만 볼 수 있음)
}

export type ViewState = 'HOME' | 'READ' | 'WRITE' | 'EDIT';

export interface GenerationRun {
  id: number;
  created_at: string;
  status: 'success' | 'failed';
  keyword: string | null;
  topic: string | null;
  post_id: string | null;
  error_message: string | null;
  trends_raw: unknown | null;
}

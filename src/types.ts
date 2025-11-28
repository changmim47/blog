
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
  audioUrl?: string;
  likes?: number;            // 좋아요 수
}

export type ViewState = 'HOME' | 'READ' | 'WRITE' | 'EDIT';

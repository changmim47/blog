
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { BlogPost, PostType } from '../types';
import { 
    ChevronLeftIcon, MusicIcon, CameraIcon, CloudArrowUpIcon, 
    XMarkIcon, ArrowDownTrayIcon, PhotoIcon,
    BoldIcon, ItalicIcon, H1Icon, H2Icon
} from './Icons';
import { uploadFile, getAllPosts } from '../services/storage';

interface EditorProps {
  initialPost?: BlogPost; 
  defaultType: PostType;
  onSave: (post: BlogPost) => void;
  onCancel: () => void;
  isEdit?: boolean;
}

const Editor: React.FC<EditorProps> = ({ initialPost, defaultType, onSave, onCancel, isEdit }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlType = searchParams.get('type') as PostType | null;
  
  // Set initial post type based on URL params (new post) or existing data (edit)
  const [postType, setPostType] = useState<PostType>(() => {
    if (initialPost?.type) return initialPost.type;
    if (urlType === 'gallery' || urlType === 'playlist' || urlType === 'blog') return urlType;
    return defaultType;
  });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [contentImages, setContentImages] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [likes, setLikes] = useState(0);
  const [createdAt, setCreatedAt] = useState(Date.now());
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(!!isEdit);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const contentImagesInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch post data if in edit mode
  useEffect(() => {
      if (isEdit && id) {
          setIsFetching(true);
          getAllPosts().then(posts => {
              const found = posts.find(p => p.id === id);
              if (found) {
                  setTitle(found.title);
                  setContent(found.content);
                  setTags(found.tags.join(', '));
                  setCoverImage(found.coverImage || '');
                  setPostType(found.type);
                  setContentImages(found.contentImages || ((found as any).contentImage ? [(found as any).contentImage] : []));
                  setAudioUrl(found.audioUrl || '');
                  setLikes(found.likes || 0);
                  setCreatedAt(found.createdAt);
              }
              setIsFetching(false);
          });
      } else if (initialPost) {
        // Initialize from prop if provided (fallback or direct usage)
        setTitle(initialPost.title);
        setContent(initialPost.content);
        setTags(initialPost.tags.join(', '));
        setCoverImage(initialPost.coverImage || '');
        setPostType(initialPost.type);
        setContentImages(initialPost.contentImages || ((initialPost as any).contentImage ? [(initialPost as any).contentImage] : []));
        setAudioUrl(initialPost.audioUrl || '');
        setLikes(initialPost.likes || 0);
        setCreatedAt(initialPost.createdAt);
      }
  }, [isEdit, id, initialPost]);

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'audio') => {
    const file = e.target.files?.[0];
    if (file) processSingleFile(file, type);
  };

  const processSingleFile = async (file: File, type: 'cover' | 'audio') => {
    const LIMIT_MB = 50;
    if (file.size > LIMIT_MB * 1024 * 1024) {
        alert(`파일 크기가 너무 큽니다. ${LIMIT_MB}MB 이하의 파일을 사용해주세요.`);
        return;
    }

    setIsLoading(true);
    try {
        const folder = type === 'cover' ? 'images' : 'audio';
        const publicUrl = await uploadFile(file, folder);
        
        if (type === 'cover') setCoverImage(publicUrl);
        if (type === 'audio') setAudioUrl(publicUrl);
    } catch (error: any) {
        console.error("Upload failed:", error);
        alert(`업로드 실패: ${error.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleContentImagesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsLoading(true);
    try {
        const uploadPromises = files.map(async (file) => {
            if (file.size > 50 * 1024 * 1024) throw new Error(`파일 ${file.name}의 크기가 50MB를 초과합니다.`);
            return await uploadFile(file, 'images');
        });
        const newUrls = await Promise.all(uploadPromises);
        setContentImages(prev => [...prev, ...newUrls]);
    } catch (error: any) {
        console.error("Multi-upload failed:", error);
        alert(`이미지 업로드 실패: ${error.message}`);
    } finally {
        setIsLoading(false);
        if (contentImagesInputRef.current) contentImagesInputRef.current.value = '';
    }
  };

  const removeContentImage = (indexToRemove: number) => {
      setContentImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const insertTextAtCursor = (textToInsert: string) => {
      if (textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          const text = content;
          const before = text.substring(0, start);
          const after = text.substring(end, text.length);
          
          setContent(before + textToInsert + after);
          
          // Re-focus and set cursor position (next tick)
          setTimeout(() => {
              if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.selectionStart = start + textToInsert.length;
                  textareaRef.current.selectionEnd = start + textToInsert.length;
              }
          }, 0);
      } else {
          setContent(prev => prev + textToInsert);
      }
  };

  const insertFormat = (tagStart: string, tagEnd: string = '') => {
      if (textareaRef.current) {
          const start = textareaRef.current.selectionStart;
          const end = textareaRef.current.selectionEnd;
          const text = content;
          
          const selection = text.substring(start, end);
          const before = text.substring(0, start);
          const after = text.substring(end, text.length);
          
          // If no selection, just insert tags with cursor in middle
          // If selection, wrap it
          const newText = before + tagStart + selection + tagEnd + after;
          setContent(newText);

          setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                // If selection existed, keep it selected inside tags
                // If no selection, place cursor inside tags
                if (selection.length > 0) {
                     textareaRef.current.selectionStart = start + tagStart.length;
                     textareaRef.current.selectionEnd = end + tagStart.length;
                } else {
                     textareaRef.current.selectionStart = start + tagStart.length;
                     textareaRef.current.selectionEnd = start + tagStart.length;
                }
            }
          }, 0);
      }
  }

  const insertImageToContent = (index: number) => {
      insertTextAtCursor(`\n[image-${index + 1}]\n`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
        processSingleFile(file, 'cover');
    }
  };

  const handleSave = () => {
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }
    
    setIsLoading(true);
    
    // Create Clean Summary (Strip Markdown)
    const cleanContent = content
        .replace(/\[image-\d+\]/g, '') // Remove image tags
        .replace(/#{1,6}\s/g, '')       // Remove headings
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
        .replace(/(\*|_)(.*?)\1/g, '$2')   // Remove italic
        .replace(/>\s/g, '')            // Remove blockquotes
        .replace(/`/g, '')              // Remove code ticks
        .replace(/\n+/g, ' ')           // Replace newlines with space
        .trim();

    const summary = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");
    const finalCoverImage = coverImage || `https://picsum.photos/800/400?random=${Date.now()}`;

    const newPost: BlogPost = {
      id: (isEdit && id) ? id : Date.now().toString(),
      type: postType,
      title,
      content,
      summary,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: createdAt,
      coverImage: finalCoverImage,
      contentImages: contentImages,
      audioUrl: audioUrl,
      likes: likes,
    };

    onSave(newPost);
  };

  const getCoverLabel = () => {
      if (postType === 'gallery') return '대표 썸네일 (필수)';
      return '커버/배경 이미지';
  };

  if (isFetching) {
      return <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Loading editor...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in relative">
      {/* Loading Overlay */}
      {isLoading && (
          <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center rounded-2xl">
              <div className="flex flex-col items-center">
                  <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
                  <p className="text-indigo-600 font-medium">업로드 및 처리 중...</p>
              </div>
          </div>
      )}

      <div className="flex justify-between items-center mb-6">
          <button 
            onClick={onCancel}
            className="flex items-center text-slate-500 hover:text-slate-800 transition-colors"
            disabled={isLoading}
          >
            <ChevronLeftIcon className="w-5 h-5 mr-1" />
            돌아가기
          </button>
          
          <div className="flex bg-slate-100 rounded-lg p-1 text-xs font-medium">
             <button 
                onClick={() => setPostType('gallery')}
                className={`px-3 py-1 rounded-md transition-all ${postType === 'gallery' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                  사진첩
              </button>
              <button 
                onClick={() => setPostType('playlist')}
                className={`px-3 py-1 rounded-md transition-all ${postType === 'playlist' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                  플레이리스트
              </button>
              <button 
                onClick={() => setPostType('blog')}
                className={`px-3 py-1 rounded-md transition-all ${postType === 'blog' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
              >
                  블로그
              </button>
          </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        <div className="p-8">
            <div className="mb-8">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="제목을 입력하세요"
                    className="w-full text-3xl font-bold text-slate-800 placeholder-slate-300 border-b-2 border-slate-100 focus:border-indigo-500 outline-none py-2 transition-colors"
                    disabled={isLoading}
                />
            </div>

            {/* 1. Top Section: Cover & Audio */}
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 mb-8`}>
                {/* Cover Image Upload */}
                <div 
                    className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center min-h-[200px] transition-all cursor-pointer group ${
                        isDragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:bg-slate-50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !isLoading && coverInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={coverInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleSingleFileChange(e, 'cover')}
                        disabled={isLoading}
                    />
                    
                    {coverImage ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                            <img src={coverImage} alt="Cover Preview" className="max-h-48 rounded-lg shadow-sm object-contain" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                <span className="text-white font-medium flex items-center">
                                    <CameraIcon className="w-5 h-5 mr-2" />
                                    변경하기
                                </span>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setCoverImage(''); }}
                                className="absolute top-2 right-2 bg-white/90 p-1 rounded-full text-slate-600 hover:text-red-500 shadow-sm"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                <CameraIcon className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">{getCoverLabel()}</p>
                            <p className="text-xs text-slate-400 mt-1">드래그하거나 클릭하여 업로드</p>
                        </div>
                    )}
                </div>

                {/* Audio Upload */}
                <div className="flex flex-col gap-4 bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                        <label className="flex items-center text-sm font-semibold text-slate-600">
                            <MusicIcon className="w-4 h-4 mr-2" />
                            배경 음악 (선택)
                        </label>
                        {audioUrl && (
                                <button 
                                onClick={() => setAudioUrl('')}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                                disabled={isLoading}
                            >
                                삭제
                            </button>
                        )}
                    </div>

                    <input 
                        type="file" 
                        ref={audioInputRef}
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => handleSingleFileChange(e, 'audio')}
                        disabled={isLoading}
                    />

                    {!audioUrl ? (
                        <button 
                            onClick={() => audioInputRef.current?.click()}
                            className="flex items-center justify-center w-full py-8 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-indigo-400 hover:text-indigo-500 hover:bg-white transition-all h-full"
                            disabled={isLoading}
                        >
                            <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                            <span className="text-sm">음악 파일 (MP3)</span>
                        </button>
                    ) : (
                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm h-full flex flex-col justify-center items-center">
                            <audio controls src={audioUrl} className="w-full h-8 mb-2" />
                            <p className="text-xs text-green-600 font-medium">업로드 완료됨</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Middle Section: Content Images (Multiple) */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-semibold text-slate-500">
                        본문 사진첩 (여러 장 선택 가능)
                    </label>
                    <button 
                        onClick={() => contentImagesInputRef.current?.click()}
                        className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-md hover:bg-indigo-100 font-medium flex items-center"
                        disabled={isLoading}
                    >
                        <CameraIcon className="w-3 h-3 mr-1" />
                        사진 추가하기
                    </button>
                </div>
                
                <input 
                    type="file" 
                    ref={contentImagesInputRef}
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleContentImagesChange}
                    disabled={isLoading}
                />

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-h-[120px]">
                    {contentImages.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {contentImages.map((url, idx) => (
                                <div key={idx} className="relative group rounded-lg overflow-hidden shadow-sm bg-white border border-slate-100">
                                    <div className="aspect-square relative">
                                        <img src={url} alt={`Content ${idx}`} className="w-full h-full object-cover" />
                                        <button 
                                            onClick={() => removeContentImage(idx)}
                                            className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10"
                                        >
                                            <XMarkIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => insertImageToContent(idx)}
                                        className="w-full text-[10px] bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 py-1.5 font-medium border-t border-slate-200 flex items-center justify-center transition-colors"
                                        title="글 내용에 이미지 넣기"
                                    >
                                        <ArrowDownTrayIcon className="w-3 h-3 mr-1" />
                                        본문에 넣기
                                    </button>
                                </div>
                            ))}
                            <button 
                                onClick={() => contentImagesInputRef.current?.click()}
                                className="aspect-[3/4] sm:aspect-square flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-white transition-all"
                            >
                                <CloudArrowUpIcon className="w-6 h-6 mb-1" />
                                <span className="text-[10px]">추가</span>
                            </button>
                        </div>
                    ) : (
                        <div 
                            onClick={() => contentImagesInputRef.current?.click()}
                            className="flex flex-col items-center justify-center py-8 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <PhotoIcon className="w-8 h-8 mb-2 opacity-50" />
                            <p className="text-sm">사진을 이곳에 추가하세요</p>
                        </div>
                    )}
                </div>
                 <p className="text-xs text-slate-400 mt-2">
                    * Tip: 사진 아래 <b>[본문에 넣기]</b> 버튼을 누르면 글을 쓰는 위치에 사진이 배치됩니다.
                </p>
            </div>

            {/* 3. Bottom Section: Text Content with Custom Toolbar */}
            <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-500 mb-2">내용</label>
                
                {/* Custom Toolbar */}
                <div className="flex gap-1 mb-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 w-fit">
                    <button onClick={() => insertFormat('**', '**')} className="p-2 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600" title="Bold">
                        <BoldIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => insertFormat('*', '*')} className="p-2 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600" title="Italic">
                        <ItalicIcon className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-slate-300 mx-1 self-center"></div>
                    <button onClick={() => insertFormat('# ')} className="p-2 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600" title="Heading 1">
                        <H1Icon className="w-4 h-4" />
                    </button>
                    <button onClick={() => insertFormat('## ')} className="p-2 hover:bg-white hover:shadow-sm rounded transition-all text-slate-600" title="Heading 2">
                        <H2Icon className="w-4 h-4" />
                    </button>
                </div>

                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="사진과 음악에 담긴 이야기를 적어주세요..."
                    className="w-full h-80 text-lg text-slate-700 leading-relaxed placeholder-slate-300 resize-y outline-none border rounded-lg p-4 focus:border-indigo-500 transition-colors font-sans"
                    disabled={isLoading}
                />
            </div>

            <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-500 mb-2">태그</label>
                <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="태그 입력 (쉼표로 구분)"
                    className="w-full bg-slate-50 text-slate-600 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    disabled={isLoading}
                />
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-100">
                <button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? '저장 중...' : '저장하기'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Editor;

'use client';

import { useState } from 'react';
import { deletePost } from '../services/storage';
import AdminGate from './AdminGate';
import Drafts from './Drafts';

export default function DraftsPageClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleDelete = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm('정말 이 글을 삭제하시겠습니까?')) return;
    await deletePost(id);
    setRefreshKey((value) => value + 1);
  };

  return (
    <AdminGate>
      <Drafts refreshKey={refreshKey} onDeletePost={handleDelete} />
    </AdminGate>
  );
}

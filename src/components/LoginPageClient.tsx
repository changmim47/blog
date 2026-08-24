'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../services/supabaseClient';
import LoginModal from './LoginModal';

export default function LoginPageClient() {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  return (
    <div className="min-h-[60vh]">
      <LoginModal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          router.replace('/');
        }}
        onSubmit={async (email, password) => {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) {
            setOpen(false);
            router.replace('/');
            router.refresh();
          }
          return { error: error?.message ?? null };
        }}
      />
    </div>
  );
}

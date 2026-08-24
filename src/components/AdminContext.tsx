'use client';

import { createContext, useContext } from 'react';

export const AdminContext = createContext(false);

export function useIsAdmin() {
  return useContext(AdminContext);
}

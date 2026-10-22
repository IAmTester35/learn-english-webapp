'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface NavigationGuardContextType {
  isTestInProgress: boolean;
  setIsTestInProgress: (inProgress: boolean) => void;
  confirmNavigation: () => boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextType>({
  isTestInProgress: false,
  setIsTestInProgress: () => {},
  confirmNavigation: () => true,
});

export const NavigationGuardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTestInProgress, setIsTestInProgress] = useState(false);

  useEffect(() => {
    if (!isTestInProgress) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTestInProgress]);

  const confirmNavigation = useCallback(() => {
    if (!isTestInProgress) return true;
    const ok = window.confirm(
      'Bạn đang trong tiến trình làm bài thi. Rời khỏi trang này sẽ hủy toàn bộ bài làm chưa nộp. Bạn có chắc chắn muốn tiếp tục?'
    );
    if (ok) {
      setIsTestInProgress(false);
      return true;
    }
    return false;
  }, [isTestInProgress]);

  return (
    <NavigationGuardContext.Provider value={{ isTestInProgress, setIsTestInProgress, confirmNavigation }}>
      {children}
    </NavigationGuardContext.Provider>
  );
};

export function useNavigationGuard() {
  return useContext(NavigationGuardContext);
}

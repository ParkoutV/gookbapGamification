'use client'

import React, { useState, useCallback } from 'react';
import CustomDialog from '@/components/CustomDialog';

export function useCustomDialog() {
  const [dialog, setDialog] = useState<{ isOpen: boolean, type: 'alert' | 'confirm', message: string, resolve?: (val: boolean) => void }>({ 
    isOpen: false, 
    type: 'alert', 
    message: '' 
  });

  const alert = useCallback((message: string) => {
    return new Promise<void>(resolve => {
      setDialog({ isOpen: true, type: 'alert', message, resolve: () => resolve() });
    });
  }, []);
  
  const confirm = useCallback((message: string) => {
    return new Promise<boolean>(resolve => {
      setDialog({ isOpen: true, type: 'confirm', message, resolve });
    });
  }, []);

  const DialogComponent = useCallback(() => {
    if (!dialog.isOpen) return null;
    return (
      <CustomDialog
        type={dialog.type}
        message={dialog.message}
        onClose={() => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          dialog.resolve?.(false);
        }}
        onConfirm={() => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          dialog.resolve?.(true);
        }}
      />
    );
  }, [dialog]);

  return { alert, confirm, DialogComponent };
}

import { useState, useCallback } from 'react';

export function useTranslator() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progressItems, setProgressItems] = useState<any[]>([]); // UI 호환성을 위해 남겨둠
  const [currentUsage, setCurrentUsage] = useState<number | null>(null);

  const translate = useCallback(
    async (text: string, targetLanguage: string, sourceLanguage: string = 'ko') => {
      setIsTranslating(true);
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            source: sourceLanguage,
            target: targetLanguage,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || '번역 실패');
        }

        if (data.currentUsage !== undefined) {
          setCurrentUsage(data.currentUsage);
        }

        return data.translated as string;
      } catch (error) {
        console.error('번역 API 호출 에러:', error);
        throw error;
      } finally {
        setIsTranslating(false);
      }
    },
    []
  );

  return {
    isTranslating,
    progressItems,
    currentUsage,
    translate,
  };
}


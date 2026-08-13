import { useState, useEffect, useCallback } from 'react';

export interface ProgressItem {
  file: string;
  progress: number;
}

// Singleton Worker to prevent crashing the browser when multiple TranslationButtons exist
let workerInstance: Worker | null = null;
let subscribers: ((e: MessageEvent) => void)[] = [];

export function useTranslator() {
  const [isReady, setIsReady] = useState(false);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (!workerInstance) {
      workerInstance = new Worker(new URL('../utils/translationWorker.ts', import.meta.url), {
        type: 'module'
      });
      
      workerInstance.addEventListener('message', (e) => {
        subscribers.forEach(sub => sub(e));
      });
    }

    let lastUpdate = 0;
    const handleProgress = (e: MessageEvent) => {
      if (e.data.status === 'progress') {
        const x = e.data.data;
        if (x.status === 'initiate') {
          setIsReady(false);
          setProgressItems(prev => {
            if (prev.find(p => p.file === x.file)) return prev;
            return [...prev, { file: x.file, progress: 0 }];
          });
        } else if (x.status === 'progress') {
          const now = Date.now();
          if (now - lastUpdate > 200) { // Throttle updates to ~5fps to prevent React render loops freezing the browser
            lastUpdate = now;
            setProgressItems(prev => prev.map(item => 
              item.file === x.file ? { ...item, progress: x.progress } : item
            ));
          }
        } else if (x.status === 'done') {
          setProgressItems(prev => prev.filter(item => item.file !== x.file));
        } else if (x.status === 'ready') {
          setIsReady(true);
        }
      }
    };

    subscribers.push(handleProgress);
    
    return () => {
      subscribers = subscribers.filter(sub => sub !== handleProgress);
      // DO NOT terminate workerInstance so it is shared across components and navigation
    };
  }, []);

  const translate = useCallback((text: string, targetLang: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerInstance) {
        reject(new Error('Worker not initialized'));
        return;
      }

      setIsTranslating(true);
      const messageId = Math.random().toString(36).substring(7);

      const handleTranslationResult = (e: MessageEvent) => {
        if (e.data.id === messageId) {
          if (e.data.status === 'complete') {
            setIsTranslating(false);
            subscribers = subscribers.filter(sub => sub !== handleTranslationResult);
            resolve(e.data.result);
          } else if (e.data.status === 'error') {
            setIsTranslating(false);
            subscribers = subscribers.filter(sub => sub !== handleTranslationResult);
            reject(new Error(e.data.error));
          }
        }
      };

      subscribers.push(handleTranslationResult);
      workerInstance.postMessage({
        text,
        targetLang,
        id: messageId
      });
    });
  }, []);

  return {
    isReady,
    isTranslating,
    progressItems,
    translate
  };
}

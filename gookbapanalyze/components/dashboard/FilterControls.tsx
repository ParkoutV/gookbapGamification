'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export type IsSharedFilter = 'TRUE' | 'FALSE' | 'BOTH';

interface FilterControlsProps {
  onFilterChange: (branchId: string | null, isShared: IsSharedFilter, excludeDuplicates: boolean) => void;
  isAdmin: boolean;
}

interface Branch {
  branch_id: string;
  branch_name: string;
}

export function FilterControls({ onFilterChange, isAdmin }: FilterControlsProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isShared, setIsShared] = useState<IsSharedFilter>('BOTH');
  const [excludeDuplicates, setExcludeDuplicates] = useState<boolean>(false);

  const supabase = createClient();

  useEffect(() => {
    async function fetchBranches() {
      if (!isAdmin) return;
      const { data, error } = await supabase.from('branches').select('branch_id, branch_name');
      if (data && !error) {
        // Handle multilingual branch names if needed. `branch_name` is JSONB or stringified JSON based on AGENTS.md
        const parsedBranches = data.map(b => {
          let name = b.branch_name;
          try {
            const parsed = JSON.parse(b.branch_name as string);
            name = parsed.ko || parsed.en || b.branch_name;
          } catch (e) {
            // Already string or not JSON
          }
          return { ...b, branch_name: name };
        }).sort((a, b) => {
          const aIsOnline = a.branch_name.includes('온라인') ? 1 : 0;
          const bIsOnline = b.branch_name.includes('온라인') ? 1 : 0;
          return bIsOnline - aIsOnline;
        });
        setBranches(parsedBranches);
      }
    }
    fetchBranches();
  }, [isAdmin, supabase]);

  useEffect(() => {
    onFilterChange(selectedBranchId, isShared, excludeDuplicates);
  }, [selectedBranchId, isShared, excludeDuplicates, onFilterChange]);

  return (
    <div className="flex flex-wrap gap-4 items-center bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm">
      <div className="flex flex-col space-y-1">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">링크 유형</label>
        <select 
          value={isShared} 
          onChange={(e) => setIsShared(e.target.value as IsSharedFilter)}
          className="p-2 border rounded-lg text-sm bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 min-w-[120px]"
        >
          <option value="BOTH">전체</option>
          <option value="TRUE">공유 링크</option>
          <option value="FALSE">매장 링크</option>
        </select>
      </div>

      {isAdmin && (
        <div className="flex flex-col space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">지점 필터</label>
          <select 
            value={selectedBranchId || ''} 
            onChange={(e) => setSelectedBranchId(e.target.value || null)}
            className="p-2 border rounded-lg text-sm bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 min-w-[150px]"
          >
            <option value="">모든 지점 (합산)</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col space-y-1 ml-auto">
        <label className="text-xs font-medium text-transparent hidden sm:block">중복 제거</label>
        <label className="flex items-center space-x-2 p-2 border rounded-lg text-sm bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
          <input 
            type="checkbox" 
            checked={excludeDuplicates} 
            onChange={(e) => setExcludeDuplicates(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-zinc-800 focus:ring-2 dark:bg-zinc-700 dark:border-zinc-600"
          />
          <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            중복 유저 제외 (기기 기준)
          </span>
        </label>
      </div>
    </div>
  );
}

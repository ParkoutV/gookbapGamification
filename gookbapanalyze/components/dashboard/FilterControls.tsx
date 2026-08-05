'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export type IsSharedFilter = 'TRUE' | 'FALSE' | 'BOTH';

interface FilterControlsProps {
  onFilterChange: (branchId: string | null, isShared: IsSharedFilter) => void;
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
        });
        setBranches(parsedBranches);
      }
    }
    fetchBranches();
  }, [isAdmin, supabase]);

  useEffect(() => {
    onFilterChange(selectedBranchId, isShared);
  }, [selectedBranchId, isShared, onFilterChange]);

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
            <option value="DIRECT">직접 접속 (소속 없음)</option>
            {branches.map(b => (
              <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

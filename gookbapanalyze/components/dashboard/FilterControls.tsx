'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ChevronDown, ChevronUp } from 'lucide-react';

export type IsSharedFilter = 'TRUE' | 'FALSE' | 'BOTH';

export interface SurveyFilterItem {
  question_id: string;
  option_id: number;
}

interface FilterControlsProps {
  onFilterChange: (
    branchId: string | null, 
    isShared: IsSharedFilter, 
    excludeDuplicates: boolean,
    surveyFilters: SurveyFilterItem[],
    surveyFilterMode: 'AND' | 'OR'
  ) => void;
  isAdmin: boolean;
  assignedBranchId?: string;
}

interface Branch {
  branch_id: string;
  branch_name: string;
}

interface SurveyQuestion {
  question_id: string;
  question_text: any;
  options: any[];
  survey_phase: number;
  branch_id: string | null;
}

export function FilterControls({ onFilterChange, isAdmin, assignedBranchId }: FilterControlsProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isShared, setIsShared] = useState<IsSharedFilter>('BOTH');
  const [excludeDuplicates, setExcludeDuplicates] = useState<boolean>(false);

  // Survey Filter State
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [isSurveyFilterOpen, setIsSurveyFilterOpen] = useState(false);
  const [surveyFilters, setSurveyFilters] = useState<SurveyFilterItem[]>([]);
  const [surveyFilterMode, setSurveyFilterMode] = useState<'AND' | 'OR'>('AND');

  const supabase = createClient();

  useEffect(() => {
    async function fetchBranches() {
      if (!isAdmin) return;
      const { data, error } = await supabase.from('branches').select('branch_id, branch_name');
      if (data && !error) {
        const parsedBranches = data.map(b => {
          let name = b.branch_name;
          try {
            const parsed = JSON.parse(b.branch_name as string);
            name = parsed.ko || parsed.en || b.branch_name;
          } catch (e) {}
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
    async function fetchSurveyQuestions() {
      let query = supabase.from('survey_questions').select('*').eq('is_active', true).neq('question_type', 2).order('survey_phase', { ascending: true }).order('order_index', { ascending: true });
      const { data, error } = await query;
      
      if (data && !error) {
        let filtered = data;
        if (!isAdmin) {
          // User: can see Phase 0, 1 and their branch's Phase 2
          filtered = data.filter(q => q.survey_phase !== 2 || q.branch_id === assignedBranchId);
        }
        setSurveyQuestions(filtered);
      }
    }
    fetchSurveyQuestions();
  }, [isAdmin, assignedBranchId, supabase]);

  useEffect(() => {
    onFilterChange(selectedBranchId, isShared, excludeDuplicates, surveyFilters, surveyFilterMode);
  }, [selectedBranchId, isShared, excludeDuplicates, surveyFilters, surveyFilterMode, onFilterChange]);

  const toggleSurveyFilter = (question_id: string, option_id: number) => {
    setSurveyFilters(prev => {
      const exists = prev.find(p => p.question_id === question_id && p.option_id === option_id);
      if (exists) {
        return prev.filter(p => !(p.question_id === question_id && p.option_id === option_id));
      } else {
        return [...prev, { question_id, option_id }];
      }
    });
  };

  const getQuestionText = (textObj: any) => {
    if (!textObj) return '질문';
    if (typeof textObj === 'string') {
      try {
        const parsed = JSON.parse(textObj);
        return parsed.ko || parsed.en || textObj;
      } catch (e) {
        return textObj;
      }
    }
    return textObj.ko || textObj.en || JSON.stringify(textObj);
  };

  return (
    <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm w-full">
      <div className="flex flex-wrap gap-4 items-center">
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

      <div className="border-t border-gray-100 dark:border-zinc-800 pt-3">
        <button 
          onClick={() => setIsSurveyFilterOpen(!isSurveyFilterOpen)}
          className="flex items-center justify-between w-full p-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <span>설문 응답 기반 KPI 필터링</span>
          {isSurveyFilterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isSurveyFilterOpen && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-4 items-center bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-lg border border-gray-100 dark:border-zinc-800">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">필터 적용 방식:</span>
                <select 
                  value={surveyFilterMode}
                  onChange={(e) => setSurveyFilterMode(e.target.value as 'AND' | 'OR')}
                  className="p-1.5 border rounded-md text-xs bg-white dark:bg-zinc-800 dark:border-zinc-700"
                >
                  <option value="AND">모두 만족 (AND)</option>
                  <option value="OR">하나라도 만족 (OR)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {surveyQuestions.map(q => (
                <div key={q.question_id} className="border border-gray-200 dark:border-zinc-700 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2 truncate" title={getQuestionText(q.question_text)}>
                    {getQuestionText(q.question_text)}
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {Array.isArray(q.options) && q.options.map((opt, optIdx) => {
                      const isChecked = surveyFilters.some(f => f.question_id === q.question_id && f.option_id === optIdx);
                      return (
                        <label key={optIdx} className="flex items-center space-x-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleSurveyFilter(q.question_id, optIdx)}
                            className="w-3.5 h-3.5 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-zinc-800 dark:bg-zinc-700 dark:border-zinc-600"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate" title={getQuestionText(opt)}>
                            {getQuestionText(opt)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

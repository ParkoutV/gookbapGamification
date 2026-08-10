'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { FilterControls, IsSharedFilter } from '@/components/dashboard/FilterControls';
import { StatCard } from '@/components/dashboard/StatCard';
import dynamic from 'next/dynamic';

const DailyParticipantsChart = dynamic(() => import('@/components/dashboard/Charts').then(mod => mod.DailyParticipantsChart), { ssr: false });
const ConversionFunnelChart = dynamic(() => import('@/components/dashboard/Charts').then(mod => mod.ConversionFunnelChart), { ssr: false });
const CouponStatsChart = dynamic(() => import('@/components/dashboard/Charts').then(mod => mod.CouponStatsChart), { ssr: false });
import { Users, PlayCircle, CheckCircle, Ticket, CheckSquare, Search, Link as LinkIcon, QrCode, X } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { QRCodeCanvas } from 'qrcode.react';

interface DashboardClientProps {
  isAdmin: boolean;
  assignedBranchId?: string;
}

export function DashboardClient({ isAdmin, assignedBranchId }: DashboardClientProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isShared, setIsShared] = useState<IsSharedFilter>('BOTH');
  const [excludeDuplicates, setExcludeDuplicates] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [storeTrackId, setStoreTrackId] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  
  // Aggregate KPIs
  const [kpis, setKpis] = useState({
    visitors: 0,
    gameStarts: 0,
    completions: 0,
    surveyCompletions: 0,
    couponIssues: 0,
    couponUses: 0,
    shares: 0,
    shareInflows: 0
  });

  // Chart Data
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [couponData, setCouponData] = useState<any[]>([]);

  const supabase = createClient();

  useEffect(() => {
    async function fetchStoreTrack() {
      if (!isAdmin && assignedBranchId) {
        const { data } = await supabase
          .from('tracks')
          .select('track_id')
          .eq('branch_id', assignedBranchId)
          .eq('is_shared', false)
          .single();
        if (data) setStoreTrackId(data.track_id);
      }
    }
    fetchStoreTrack();
  }, [isAdmin, assignedBranchId, supabase]);

  useEffect(() => {
    if (isQrModalOpen) {
      const timer = setTimeout(() => {
        const canvas = document.getElementById('dashboard-qr-canvas') as HTMLCanvasElement;
        if (canvas) setQrImageUrl(canvas.toDataURL('image/png'));
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setQrImageUrl('');
    }
  }, [isQrModalOpen]);

  const copyToClipboard = () => {
    if (!storeTrackId) return;
    const url = `https://1953-brother-gookbap.vercel.app/?q=${storeTrackId}`;
    navigator.clipboard.writeText(url);
    alert('가게 링크가 클립보드에 복사되었습니다.');
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Aggregated Data
      const params: any = {
        start_date: startDate ? startDate.toISOString() : undefined,
        end_date: endDate ? endDate.toISOString() : undefined,
        exclude_duplicates: excludeDuplicates
      };

      const { data: aggData, error: aggError } = await supabase.rpc('get_track_kpi_dashboard', params);
      
      if (aggError) throw aggError;

      let filteredAgg = aggData || [];
      
      // Filter by branch
      if (isAdmin && branchId) {
        if (branchId === 'DIRECT') {
          filteredAgg = filteredAgg.filter((row: any) => row.track_id === null);
        } else {
          filteredAgg = filteredAgg.filter((row: any) => row.branch_id === branchId || row.track_id?.includes(branchId));
        }
      }
      
      // Filter by is_shared
      if (isShared === 'TRUE') {
        filteredAgg = filteredAgg.filter((row: any) => row.is_shared === true);
      } else if (isShared === 'FALSE') {
        filteredAgg = filteredAgg.filter((row: any) => row.is_shared === false);
      }

      let totals = {
        visitors: 0,
        gameStarts: 0,
        completions: 0,
        surveyCompletions: 0,
        couponIssues: 0,
        couponUses: 0,
        shares: 0,
        shareInflows: 0,
      };

      filteredAgg.forEach((row: any) => {
        totals.visitors += Number(row.visitors || 0);
        totals.gameStarts += Number(row.game_starters || 0);
        totals.completions += Number(row.game_completers || 0);
        totals.surveyCompletions += Number(row.survey_completers || 0);
        totals.couponIssues += Number(row.total_coupons_issued || 0);
        totals.couponUses += Number(row.total_coupons_used || 0);
        totals.shares += Number(row.share_clickers || 0);
        if (row.is_shared) {
          totals.shareInflows += Number(row.visitors || 0);
        }
      });

      setKpis(totals);

      // Funnel
      setFunnelData([
        { step: '방문', count: totals.visitors },
        { step: '게임 시작', count: totals.gameStarts },
        { step: '완주', count: totals.completions },
        { step: '설문 완료', count: totals.surveyCompletions },
        { step: '쿠폰 발급', count: totals.couponIssues },
        { step: '쿠폰 사용', count: totals.couponUses },
      ]);

      // Fetch all coupon types to initialize the map with 0s
      const { data: allCoupons, error: allCouponsErr } = await supabase.from('coupon_effects').select('coupon_type');
      if (allCouponsErr) throw allCouponsErr;

      const couponMap: Record<string, { issued: number, used: number }> = {};
      allCoupons?.forEach((c: any) => {
        let typeName = '알 수 없음';
        try {
          const parsed = JSON.parse(c.coupon_type);
          typeName = parsed.ko || parsed.en || '알 수 없음';
        } catch (e) {
          typeName = c.coupon_type;
        }
        if (!couponMap[typeName]) couponMap[typeName] = { issued: 0, used: 0 };
      });

      filteredAgg.forEach((row: any) => {
        if (Array.isArray(row.coupon_breakdown)) {
          row.coupon_breakdown.forEach((cb: any) => {
            let typeName = '알 수 없음';
            try {
              const parsed = JSON.parse(cb.type);
              typeName = parsed.ko || parsed.en || '알 수 없음';
            } catch (e) {
              typeName = cb.type;
            }
            if (!couponMap[typeName]) couponMap[typeName] = { issued: 0, used: 0 };
            couponMap[typeName].issued += Number(cb.issued || 0);
            couponMap[typeName].used += Number(cb.used || 0);
          });
        }
      });

      const actualCouponData = Object.entries(couponMap).map(([name, stats]) => ({
        name,
        issued: stats.issued,
        used: stats.used
      }));

      setCouponData(actualCouponData);

      // 2. Fetch Daily Data (7 days back from endDate or now)
      const refDate = endDate || new Date();
      const dailyPromises = [];
      const dayLabels: string[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = subDays(refDate, i);
        dayLabels.push(format(d, 'MM/dd(E)'));
        
        const startOfDayStr = new Date(d.setHours(0,0,0,0)).toISOString();
        const endOfDayStr = new Date(d.setHours(23,59,59,999)).toISOString();

        dailyPromises.push(
          supabase.rpc('get_track_kpi_dashboard', {
            start_date: startOfDayStr,
            end_date: endOfDayStr,
            exclude_duplicates: excludeDuplicates
          })
        );
      }

      const dailyResults = await Promise.all(dailyPromises);
      
      const newDailyData = dailyResults.map((res, index) => {
        let dAgg = res.data || [];
        if (isAdmin && branchId) {
          if (branchId === 'DIRECT') {
            dAgg = dAgg.filter((row: any) => row.track_id === null);
          } else {
            dAgg = dAgg.filter((row: any) => row.branch_id === branchId || row.track_id?.includes(branchId));
          }
        }
        if (isShared === 'TRUE') {
          dAgg = dAgg.filter((row: any) => row.is_shared === true);
        } else if (isShared === 'FALSE') {
          dAgg = dAgg.filter((row: any) => row.is_shared === false);
        }
        
        let v = 0; let g = 0;
        dAgg.forEach((r: any) => {
          v += Number(r.visitors || 0);
          g += Number(r.game_starters || 0);
        });

        return {
          date: dayLabels[index],
          visitors: v,
          game_starts: g
        };
      });

      setDailyData(newDailyData);

    } catch (e: any) {
      console.error("Dashboard fetch error:", e);
      if (typeof e === 'object') {
        console.error("Error details:", JSON.stringify(e, null, 2));
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, branchId, isShared, excludeDuplicates, isAdmin, supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Rates calculation
  const gameStartRate = kpis.visitors ? ((kpis.gameStarts / kpis.visitors) * 100).toFixed(1) : '0.0';
  const completionRate = kpis.gameStarts ? ((kpis.completions / kpis.gameStarts) * 100).toFixed(1) : '0.0';
  const couponUseRate = kpis.couponIssues ? ((kpis.couponUses / kpis.couponIssues) * 100).toFixed(1) : '0.0';
  const surveyCompletionRate = kpis.completions ? ((kpis.surveyCompletions / kpis.completions) * 100).toFixed(1) : '0.0';

  const shareParticipationRate = kpis.visitors ? ((kpis.shares / kpis.visitors) * 100).toFixed(1) : '0.0';
  const inflowPerShare = kpis.shares ? (kpis.shareInflows / kpis.shares).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 pb-10">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">대시보드</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">게임 실적 및 KPI 현황을 확인합니다.</p>
          
          {!isAdmin && storeTrackId && (
            <div className="mt-4 flex items-center space-x-2 bg-gray-50 dark:bg-zinc-800 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-700 w-max">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">내 가게 링크:</span>
              <code className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded block max-w-[200px] truncate">
                {storeTrackId}
              </code>
              <button onClick={copyToClipboard} className="text-gray-500 hover:text-blue-600 transition-colors p-1 bg-white dark:bg-zinc-900 rounded shadow-sm border border-gray-200 dark:border-zinc-700" title="링크 복사">
                <LinkIcon className="w-4 h-4" />
              </button>
              <button onClick={() => setIsQrModalOpen(true)} className="text-gray-500 hover:text-blue-600 transition-colors p-1 bg-white dark:bg-zinc-900 rounded shadow-sm border border-gray-200 dark:border-zinc-700" title="QR 코드 생성">
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-4 w-full lg:w-auto">
          <DateRangePicker onFilterChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
          <FilterControls isAdmin={isAdmin} onFilterChange={(b, s, e) => { 
            setBranchId(b); setIsShared(s); setExcludeDuplicates(e); 
          }} />  </div>
      </div>

      {loading && (
        <div className="w-full h-1 bg-blue-100 overflow-hidden rounded-full">
          <div className="w-1/2 h-full bg-blue-500 animate-pulse rounded-full"></div>
        </div>
      )}

      {/* Top 5 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="방문자 수" value={kpis.visitors.toLocaleString()} icon={<Users className="w-5 h-5" />} />
        <StatCard title="게임 시작률" value={`${gameStartRate}%`} icon={<PlayCircle className="w-5 h-5" />} subtitle={`시작 ${kpis.gameStarts}건`} />
        <StatCard title="완주율" value={`${completionRate}%`} icon={<CheckCircle className="w-5 h-5" />} subtitle={`완주 ${kpis.completions}건`} />
        <StatCard title="설문 완료율" value={`${surveyCompletionRate}%`} icon={<CheckSquare className="w-5 h-5" />} subtitle={`완료 ${kpis.surveyCompletions}건`} />
        <StatCard title="쿠폰 사용률" value={`${couponUseRate}%`} icon={<Ticket className="w-5 h-5" />} subtitle={`사용 ${kpis.couponUses}건`} />
      </div>

      {/* Charts & KPIs Grid */}
      <div className="grid grid-cols-1 gap-6">
        <DailyParticipantsChart data={dailyData} />
        <ConversionFunnelChart data={funnelData} />
        
        {/* Share KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="공유 참여율" value={`${shareParticipationRate}%`} />
          <StatCard title="공유 횟수" value={kpis.shares.toLocaleString()} />
          <StatCard title="공유 유입 수" value={kpis.shareInflows.toLocaleString()} />
          <StatCard title="공유당 유입 수" value={inflowPerShare} />
        </div>

        {/* Coupon Stats */}
        <CouponStatsChart data={couponData} />
      </div>

      {/* QR Code Modal */}
      {isQrModalOpen && storeTrackId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsQrModalOpen(false)} />
          <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm ring-1 ring-gray-200 dark:ring-zinc-800 p-8 text-center flex flex-col items-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">우리 가게 QR 코드</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-8">손님들에게 스마트폰으로 보여주세요.</p>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center justify-center min-h-[232px]">
              <div style={{ display: qrImageUrl ? 'none' : 'block' }}>
                <QRCodeCanvas 
                  id="dashboard-qr-canvas"
                  value={`https://1953-brother-gookbap.vercel.app/?q=${storeTrackId}`} 
                  size={200}
                  level="H"
                  includeMargin={false}
                />
              </div>
              {qrImageUrl && (
                <img src={qrImageUrl} alt="QR Code" width={200} height={200} className="w-[200px] h-[200px]" />
              )}
            </div>
            
            <p className="mt-6 text-xs text-gray-400 break-all w-full bg-gray-50 dark:bg-zinc-950 p-3 rounded-lg border border-gray-100 dark:border-zinc-800">
              https://1953-brother-gookbap.vercel.app/?q={storeTrackId}
            </p>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white bg-gray-900 dark:bg-zinc-800 rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-700 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

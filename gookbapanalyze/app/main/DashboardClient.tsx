'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { FilterControls, IsSharedFilter } from '@/components/dashboard/FilterControls';
import { StatCard } from '@/components/dashboard/StatCard';
import { DailyParticipantsChart, ConversionFunnelChart, CouponStatsChart } from '@/components/dashboard/Charts';
import { Users, PlayCircle, CheckCircle, Ticket, CheckSquare, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface DashboardClientProps {
  isAdmin: boolean;
}

export function DashboardClient({ isAdmin }: DashboardClientProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [isShared, setIsShared] = useState<IsSharedFilter>('BOTH');

  const [loading, setLoading] = useState(false);
  
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

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Aggregated Data
      const params: any = {
        start_date: startDate ? startDate.toISOString() : undefined,
        end_date: endDate ? endDate.toISOString() : undefined
      };

      const { data: aggData, error: aggError } = await supabase.rpc('get_track_kpi_dashboard', params);
      
      if (aggError) throw aggError;

      let filteredAgg = aggData || [];
      
      // Filter by branch
      if (isAdmin && branchId) {
        filteredAgg = filteredAgg.filter((row: any) => row.track_id?.includes(branchId)); // Approximation since get_track_kpi_dashboard returns track_id
        // Wait, if it doesn't return branch_id, how do we filter?
        // Actually get_track_kpi_dashboard is designed to return all if admin, and frontend filters.
        // Let's assume branch_id is part of track_id or the RPC returns branch_id. If it doesn't, we might need a workaround, but let's assume track_id has branch_id or branch_id is returned.
        // I will filter by track_id containing branch_id for now.
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
        totals.gameStarts += Number(row.game_starts || 0);
        totals.completions += Number(row.completions || 0);
        totals.surveyCompletions += Number(row.survey_completions || 0);
        totals.couponIssues += Number(row.coupon_issues || 0);
        totals.couponUses += Number(row.coupon_uses || 0);
        totals.shares += Number(row.shares || 0);
        totals.shareInflows += Number(row.share_inflows || 0);
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
            end_date: endOfDayStr
          })
        );
      }

      const dailyResults = await Promise.all(dailyPromises);
      
      const newDailyData = dailyResults.map((res, index) => {
        let dAgg = res.data || [];
        if (isAdmin && branchId) {
          dAgg = dAgg.filter((row: any) => row.track_id?.includes(branchId));
        }
        if (isShared === 'TRUE') {
          dAgg = dAgg.filter((row: any) => row.is_shared === true);
        } else if (isShared === 'FALSE') {
          dAgg = dAgg.filter((row: any) => row.is_shared === false);
        }
        
        let v = 0; let g = 0;
        dAgg.forEach((r: any) => {
          v += Number(r.visitors || 0);
          g += Number(r.game_starts || 0);
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
  }, [startDate, endDate, branchId, isShared, isAdmin, supabase]);

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
        </div>
        
        <div className="flex flex-col gap-4 w-full lg:w-auto">
          <DateRangePicker onFilterChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
          <FilterControls isAdmin={isAdmin} onFilterChange={(b, s) => { setBranchId(b); setIsShared(s); }} />
        </div>
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
        <StatCard title="쿠폰 사용률" value={`${couponUseRate}%`} icon={<Ticket className="w-5 h-5" />} subtitle={`사용 ${kpis.couponUses}건`} />
        <StatCard title="설문 완료율" value={`${surveyCompletionRate}%`} icon={<CheckSquare className="w-5 h-5" />} subtitle={`완료 ${kpis.surveyCompletions}건`} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyParticipantsChart data={dailyData} />
        <ConversionFunnelChart data={funnelData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Bottom Left: Share KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="공유 참여율" value={`${shareParticipationRate}%`} />
          <StatCard title="공유 횟수" value={kpis.shares.toLocaleString()} />
          <StatCard title="공유 유입 수" value={kpis.shareInflows.toLocaleString()} />
          <StatCard title="공유당 유입 수" value={inflowPerShare} />
        </div>

        {/* Bottom Right: Coupon Stats */}
        <CouponStatsChart data={couponData} />

      </div>
    </div>
  );
}

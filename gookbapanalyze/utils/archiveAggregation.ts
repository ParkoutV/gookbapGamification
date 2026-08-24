export interface KpiAggregationOptions {
  start_date?: string;
  end_date?: string;
  exclude_duplicates?: boolean;
  survey_filters?: any[];
  survey_filter_mode?: 'AND' | 'OR';
}

export function aggregateKpiFromSnapshot(snapshot: any, options: KpiAggregationOptions) {
  const { trackLogs, gameScoreLogs, issuedCoupons, tracksData } = snapshot;
  
  // Date filter trackLogs
  let validLogs = trackLogs || [];
  if (options.start_date) {
    const sDate = new Date(options.start_date).getTime();
    validLogs = validLogs.filter((l: any) => new Date(l.access_time).getTime() >= sDate);
  }
  if (options.end_date) {
    const eDate = new Date(options.end_date).getTime();
    validLogs = validLogs.filter((l: any) => new Date(l.access_time).getTime() <= eDate);
  }

  // Create a mapping from participant_id to their max game score within valid date range?
  // Actually gameScoreLogs doesn't need to be strictly date filtered if the user played, but RPC filters game scores by start/end date too.
  const maxScores = new Map<string, number>();
  (gameScoreLogs || []).forEach((gs: any) => {
    if (options.start_date && new Date(gs.joined_time).getTime() < new Date(options.start_date).getTime()) return;
    if (options.end_date && new Date(gs.joined_time).getTime() > new Date(options.end_date).getTime()) return;
    const current = maxScores.get(gs.participant_id) || 0;
    if (gs.gookbap_score > current) {
      maxScores.set(gs.participant_id, gs.gookbap_score);
    }
  });

  // Basic survey filter logic
  const filteredParticipants = new Set<string>();
  if (options.survey_filters && options.survey_filters.length > 0) {
    const { surveyResponses } = snapshot;
    const participantsWithResponses = new Map<string, any[]>();
    (surveyResponses || []).forEach((sr: any) => {
      if (!participantsWithResponses.has(sr.participant_id)) {
        participantsWithResponses.set(sr.participant_id, []);
      }
      participantsWithResponses.get(sr.participant_id)!.push(sr);
    });

    (snapshot.participants || []).forEach((p: any) => {
      const pResponses = participantsWithResponses.get(p.participant_id) || [];
      let matchCount = 0;
      options.survey_filters!.forEach(f => {
        const hasMatch = pResponses.some((r: any) => {
          if (r.question_id !== f.question_id) return false;
          const answers = typeof r.answer_data === 'string' ? JSON.parse(r.answer_data) : r.answer_data;
          if (Array.isArray(answers)) {
            return answers.some((a: any) => (a.option_id || a.id) === f.option_id);
          } else if (answers && typeof answers === 'object') {
            return (answers.option_id || answers.id) === f.option_id;
          }
          return answers === f.option_id;
        });
        if (hasMatch) matchCount++;
      });

      if (options.survey_filter_mode === 'AND' && matchCount === options.survey_filters!.length) {
        filteredParticipants.add(p.participant_id);
      } else if (options.survey_filter_mode === 'OR' && matchCount > 0) {
        filteredParticipants.add(p.participant_id);
      }
    });
    
    validLogs = validLogs.filter((l: any) => filteredParticipants.has(l.participant_id));
  }

  // Deduplication
  if (options.exclude_duplicates) {
    const userBestLogs = new Map<string, any>();
    validLogs.forEach((l: any) => {
      if (!userBestLogs.has(l.participant_id)) {
        userBestLogs.set(l.participant_id, { ...l });
      } else {
        const existing = userBestLogs.get(l.participant_id);
        // Merge max stats for this user
        existing.game_start_count = Math.max(existing.game_start_count, l.game_start_count);
        existing.share_clicked = existing.share_clicked || l.share_clicked;
      }
    });
    validLogs = Array.from(userBestLogs.values());
  }

  // Group by Track
  const trackStats = new Map<string, any>();
  
  (tracksData || []).forEach((t: any) => {
    let bName = '온라인';
    if (t.branches?.branch_name) {
      bName = typeof t.branches.branch_name === 'string' ? t.branches.branch_name : JSON.stringify(t.branches.branch_name);
    }
    trackStats.set(t.track_id, {
      track_id: t.track_id,
      branch_id: t.branches?.branch_id || null, // Might not exist if we didn't fetch branch_id in tracksData
      branch_name: bName,
      is_shared: t.is_shared,
      visitors: 0,
      game_starters: 0,
      game_completers: 0,
      game_retriers: 0,
      share_clickers: 0,
      survey_completers: 0,
      total_coupons_issued: 0,
      total_coupons_used: 0,
      coupon_breakdown: [] // { type: string, issued: number, used: number }
    });
  });

  // Calculate base stats
  const trackCouponMap = new Map<string, Record<string, {issued: number, used: number}>>();

  validLogs.forEach((l: any) => {
    const tid = l.track_id || 'unknown';
    if (!trackStats.has(tid)) {
      trackStats.set(tid, {
        track_id: tid,
        branch_id: null,
        branch_name: '온라인',
        is_shared: false,
        visitors: 0,
        game_starters: 0,
        game_completers: 0,
        game_retriers: 0,
        share_clickers: 0,
        survey_completers: 0,
        total_coupons_issued: 0,
        total_coupons_used: 0,
        coupon_breakdown: []
      });
    }

    const st = trackStats.get(tid);
    st.visitors++;
    if (l.game_start_count > 0) {
      st.game_starters++;
      // Only count as completer if they actually started a game in this log AND have a score
      if ((maxScores.get(l.participant_id) || 0) > 0) {
        st.game_completers++;
      }
    }
    if (l.game_start_count > 1) st.game_retriers++;
    if (l.share_clicked) st.share_clickers++;
  });

  // Attribute surveys and coupons to the first track they visited in this log set
  const pToTrack = new Map<string, string>();
  validLogs.forEach((l: any) => {
    if (!pToTrack.has(l.participant_id)) {
      pToTrack.set(l.participant_id, l.track_id || 'unknown');
    }
  });

  (snapshot.surveyResponses || []).forEach((sr: any) => {
    if (options.start_date && new Date(sr.created_at).getTime() < new Date(options.start_date).getTime()) return;
    if (options.end_date && new Date(sr.created_at).getTime() > new Date(options.end_date).getTime()) return;

    if (sr.survey_questions?.survey_phase === 1 && pToTrack.has(sr.participant_id)) {
      const st = trackStats.get(pToTrack.get(sr.participant_id)!);
      if (st) st.survey_completers++;
    }
  });

  (snapshot.issuedCoupons || []).forEach((ic: any) => {
    if (options.start_date && new Date(ic.issued_at).getTime() < new Date(options.start_date).getTime()) return;
    if (options.end_date && new Date(ic.issued_at).getTime() > new Date(options.end_date).getTime()) return;

    if (pToTrack.has(ic.participant_id)) {
      const tid = pToTrack.get(ic.participant_id)!;
      const st = trackStats.get(tid);
      if (st) {
        st.total_coupons_issued++;
        if (ic.is_used) st.total_coupons_used++;

        if (!trackCouponMap.has(tid)) trackCouponMap.set(tid, {});
        const cmap = trackCouponMap.get(tid)!;
        const ctype = ic.coupon_effects?.coupon_type || 'Unknown';
        if (!cmap[ctype]) cmap[ctype] = { issued: 0, used: 0 };
        cmap[ctype].issued++;
        if (ic.is_used) cmap[ctype].used++;
      }
    }
  });

  // Flatten coupon breakdowns
  trackStats.forEach((st, tid) => {
    const cmap = trackCouponMap.get(tid);
    if (cmap) {
      st.coupon_breakdown = Object.entries(cmap).map(([type, counts]) => ({
        type,
        issued: counts.issued,
        used: counts.used
      }));
    }
  });

  return Array.from(trackStats.values());
}

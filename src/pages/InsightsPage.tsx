import { useState } from 'react';
import { BarChart3, Loader2, Sparkles } from 'lucide-react';
import {
  getCategoryLabel,
  ISSUE_CATEGORIES,
  REPORT_STATUSES,
  type CivicReport,
  type WeeklySummaryResult,
} from '../types/civic';

interface InsightsPageProps {
  reports: CivicReport[];
  loading: boolean;
}

export function InsightsPage({ reports, loading }: InsightsPageProps) {
  const [summary, setSummary] = useState<WeeklySummaryResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const total = reports.length;
  const resolvedCount = reports.filter((r) => r.status === 'Resolved').length;
  const openCount = total - resolvedCount;
  const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

  // Category distribution from Firestore
  const categoryCounts = ISSUE_CATEGORIES.map((c) => ({
    category: c.value,
    label: c.label,
    count: reports.filter((r) => r.category === c.value).length,
  })).sort((a, b) => b.count - a.count);

  const maxCatCount = Math.max(1, ...categoryCounts.map((c) => c.count));

  // Recurring areas grouped strictly from real reports
  const areaFrequency: Record<string, number> = {};
  reports.forEach((r) => {
    const key = `${r.area}, ${r.city}`;
    areaFrequency[key] = (areaFrequency[key] || 0) + 1;
  });
  const topAreas = Object.entries(areaFrequency)
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Recent 7-day trend computed from real createdAtMs
  const now = new Date();
  const dailyTrend = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - i));
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const end = start + 86_400_000;
    const count = reports.filter((r) => r.createdAtMs >= start && r.createdAtMs < end).length;
    return {
      label: day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      count,
    };
  });
  const maxDayCount = Math.max(1, ...dailyTrend.map((d) => d.count));

  const handleGenerateSummary = async () => {
    setSummaryError(null);
    if (total === 0) {
      setSummaryError('At least one stored report is needed before generating a summary.');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: reports[0]?.city || 'Hyderabad',
          totalReports: total,
          resolvedCount,
          openCount,
          categoryBreakdown: categoryCounts.map((c) => ({ category: c.label, count: c.count })),
          topAreas,
          recentReports: reports.slice(0, 20).map((r) => ({
            category: getCategoryLabel(r.category),
            title: r.title,
            area: r.area,
            status: r.status,
            verificationCount: r.verificationCount,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summary generation failed.');
      setSummary(data);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Unable to generate AI summary.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Civic Insights &amp; Trends
          </h1>
          <p className="text-sm text-[#4F5651] mt-1">
            All metrics below are computed directly from stored Firestore reports. Verified counts
            are separated clearly from AI-generated narrative summaries.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateSummary}
          disabled={generating || total === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] disabled:opacity-50 self-start cursor-pointer"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{generating ? 'Synthesizing...' : 'Generate AI Community Summary'}</span>
        </button>
      </div>

      {/* Verified Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Verified Database Total</p>
          <p className="font-mono text-2xl font-semibold text-[#1A1D1B] mt-1 tabular-nums">
            {loading ? '—' : total}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Verified Resolution Rate</p>
          <p className="font-mono text-2xl font-semibold text-[#15803D] mt-1 tabular-nums">
            {loading ? '—' : `${resolutionRate}%`}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Open / Pending Reports</p>
          <p className="font-mono text-2xl font-semibold text-[#B45309] mt-1 tabular-nums">
            {loading ? '—' : openCount}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Unique Corridors Reported</p>
          <p className="font-mono text-2xl font-semibold text-[#14452F] mt-1 tabular-nums">
            {loading ? '—' : Object.keys(areaFrequency).length}
          </p>
        </div>
      </div>

      {summaryError && (
        <div role="alert" className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {summaryError}
        </div>
      )}

      {/* AI Weekly Summary Panel */}
      {summary && (
        <section className="bg-white border border-[#A7F3D0] rounded-xl p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#14452F]">
              AI-Generated Briefing (Derived from Live Database)
            </span>
            <span className="font-mono text-xs text-[#717873]">
              {new Date(summary.generatedAt).toLocaleString('en-IN')}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-[#1A1D1B]">{summary.headline}</h2>
          <p className="text-sm text-[#4F5651] leading-relaxed">{summary.executiveSummary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <h3 className="text-xs font-semibold text-[#1A1D1B] mb-2">Observed Patterns</h3>
              <ul className="list-disc pl-4 space-y-1.5 text-sm text-[#4F5651]">
                {summary.keyPatterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#1A1D1B] mb-2">
                Attention Areas (Based on Reports)
              </h3>
              <ul className="list-disc pl-4 space-y-1.5 text-sm text-[#4F5651]">
                {summary.recommendedAttentionAreas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-[#717873] pt-3 border-t border-[#E5E3DC]">
            {summary.dataDisclaimer}
          </p>
        </section>
      )}

      {total === 0 && !loading ? (
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-12 text-center space-y-3">
          <BarChart3 className="w-8 h-8 text-[#717873] mx-auto" aria-hidden="true" />
          <p className="font-display text-lg font-bold text-[#1A1D1B]">
            Analytics populate automatically from real reports
          </p>
          <p className="text-sm text-[#4F5651] max-w-md mx-auto">
            Once citizens submit street reports, category distributions, recurring corridors, and
            7-day submission trends appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Category Breakdown */}
          <div className="lg:col-span-6 bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              Verified Reports by Category
            </h2>
            <div className="space-y-3">
              {categoryCounts.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#1A1D1B]">{item.label}</span>
                    <span className="font-mono text-[#4F5651] tabular-nums">{item.count}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#F3F1EC] overflow-hidden">
                    <div
                      className="h-full bg-[#14452F] rounded-full transition-all"
                      style={{ width: `${Math.round((item.count / maxCatCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7-Day Submission Trend */}
          <div className="lg:col-span-6 bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              7-Day Submission Trend
            </h2>
            <div className="h-48 flex items-end gap-1.5 sm:gap-3 pt-4 overflow-x-auto">
              {dailyTrend.map((d) => (
                <div key={d.label} className="flex-1 min-w-[36px] flex flex-col items-center gap-2 h-full justify-end">
                  <span className="font-mono text-xs text-[#4F5651] tabular-nums">{d.count}</span>
                  <div className="w-full bg-[#F3F1EC] rounded-md flex items-end h-32 overflow-hidden">
                    <div
                      className="w-full bg-[#1E7A50] rounded-md transition-all"
                      style={{ height: `${Math.max(d.count > 0 ? 10 : 0, Math.round((d.count / maxDayCount) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-[#717873] whitespace-nowrap">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recurring Locations */}
          <div className="lg:col-span-6 bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              Locations with Recurring Reports
            </h2>
            <div className="divide-y divide-[#E5E3DC]">
              {topAreas.map((item) => (
                <div key={item.area} className="py-2.5 flex items-center justify-between text-sm">
                  <span className="text-[#1A1D1B] font-medium truncate pr-4">{item.area}</span>
                  <span className="font-mono text-xs font-semibold text-[#14452F] tabular-nums shrink-0">
                    {item.count} {item.count === 1 ? 'report' : 'reports'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="lg:col-span-6 bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              Official Status Distribution
            </h2>
            <div className="divide-y divide-[#E5E3DC]">
              {REPORT_STATUSES.map((status) => {
                const count = reports.filter((r) => r.status === status).length;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={status} className="py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-[#1A1D1B]">{status}</span>
                    <span className="font-mono text-xs text-[#4F5651] tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

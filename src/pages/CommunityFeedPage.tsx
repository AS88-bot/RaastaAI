import { useState } from 'react';
import { Check, CheckCircle2, Loader2, Search, ThumbsUp } from 'lucide-react';
import {
  formatRelativeDate,
  PriorityIndicator,
  SafeCivicImage,
  StatusIndicator,
} from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { formatFirestoreErrorForUi } from '../lib/firebase';
import { verifyReportExists } from '../lib/reportsService';
import {
  getCategoryLabel,
  ISSUE_CATEGORIES,
  REPORT_STATUSES,
  type CivicReport,
  type IssueCategory,
  type ReportStatus,
} from '../types/civic';

interface CommunityFeedPageProps {
  reports: CivicReport[];
  verifiedMap: Record<string, boolean>;
  loading: boolean;
  onNavigate: (path: string) => void;
}

export function CommunityFeedPage({
  reports,
  verifiedMap,
  loading,
  onNavigate,
}: CommunityFeedPageProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | IssueCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = reports.filter((r) => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${r.title} ${r.area} ${r.landmark} ${r.city} ${r.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const handleVerify = async (report: CivicReport) => {
    setError(null);
    if (!user) {
      onNavigate('/auth?next=/feed');
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address before confirming community reports.');
      return;
    }
    if (verifiedMap[report.id] || report.status === 'Resolved') return;

    setVerifyingId(report.id);
    try {
      await verifyReportExists(report.id, user.uid, report.verificationCount);
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Unable to record verification.'));
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Community Issue Feed
          </h1>
          <p className="text-sm text-[#4F5651] mt-1">
            Public street reports submitted by citizens. Confirm open hazards to help prioritize
            attention.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(user ? '/report' : '/auth?next=/report')}
          className="px-4 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] self-start sm:self-auto cursor-pointer"
        >
          Report Issue
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white border border-[#E5E3DC] rounded-xl p-4 space-y-4">
        <div className="relative">
          <Search
            className="w-4 h-4 text-[#717873] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by road, neighborhood (e.g. Madhapur, Banjara Hills), or issue..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-[#14452F] text-white'
                  : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
              }`}
            >
              All Categories
            </button>
            {ISSUE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategoryFilter(c.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  categoryFilter === c.value
                    ? 'bg-[#14452F] text-white'
                    : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#1A1D1B] text-white'
                  : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
              }`}
            >
              All Statuses
            </button>
            {REPORT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  statusFilter === s
                    ? 'bg-[#1A1D1B] text-white'
                    : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Feed Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-80 rounded-xl bg-[#EFECE5] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-12 text-center space-y-3">
          <p className="font-display text-lg font-bold text-[#1A1D1B]">
            No civic reports found
          </p>
          <p className="text-sm text-[#4F5651] max-w-md mx-auto">
            {reports.length === 0
              ? 'No reports have been submitted to the database yet. Start by documenting an issue on your street.'
              : 'Try clearing your search or category filters to view other neighborhood reports.'}
          </p>
          {reports.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate(user ? '/report' : '/auth?next=/report')}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg cursor-pointer"
            >
              Submit First Report
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((report) => {
            const alreadyVerified = Boolean(verifiedMap[report.id]);
            const isResolved = report.status === 'Resolved';

            return (
              <article
                key={report.id}
                className="bg-white border border-[#E5E3DC] rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/reports/${report.id}`)}
                    className="w-full block text-left cursor-pointer"
                  >
                    <SafeCivicImage
                      src={report.imageUrl}
                      alt={report.title}
                      className="w-full h-48 object-cover"
                    />
                  </button>

                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <StatusIndicator status={report.status} />
                      <span className="text-xs text-[#717873] tabular-nums">
                        {formatRelativeDate(report.createdAtMs)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate(`/reports/${report.id}`)}
                      className="text-left font-display text-lg font-bold text-[#1A1D1B] hover:text-[#14452F] line-clamp-2 cursor-pointer"
                    >
                      {report.title}
                    </button>

                    <p className="text-xs text-[#717873]">
                      {getCategoryLabel(report.category)} · {report.area}, {report.city}
                    </p>

                    <p className="text-sm text-[#4F5651] line-clamp-2 leading-relaxed">
                      {report.description}
                    </p>

                    <div className="pt-1">
                      <PriorityIndicator priority={report.prioritySuggestion} />
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 border-t border-[#E5E3DC] bg-[#F8F7F4]/50 flex items-center justify-between gap-2">
                  {isResolved ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#15803D]">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Issue resolved</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={alreadyVerified || verifyingId === report.id}
                      onClick={() => void handleVerify(report)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px] ${
                        alreadyVerified
                          ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0] cursor-default'
                          : 'bg-white border border-[#D4D1C7] text-[#1A1D1B] hover:bg-[#F3F1EC] cursor-pointer'
                      }`}
                    >
                      {verifyingId === report.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : alreadyVerified ? (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <ThumbsUp className="w-3.5 h-3.5 text-[#14452F]" aria-hidden="true" />
                      )}
                      <span>
                        {alreadyVerified ? 'Verified' : 'Still Exists'} (
                        <span className="font-mono tabular-nums">{report.verificationCount}</span>)
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onNavigate(`/reports/${report.id}`)}
                    className="text-xs font-semibold text-[#14452F] hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Details →
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

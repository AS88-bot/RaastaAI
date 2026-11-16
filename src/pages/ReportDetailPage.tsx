import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  ThumbsUp,
} from 'lucide-react';
import {
  PriorityIndicator,
  SafeCivicImage,
  StatusIndicator,
} from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { formatFirestoreErrorForUi } from '../lib/firebase';
import { subscribeReportById, verifyReportExists } from '../lib/reportsService';
import {
  getCategoryLabel,
  getLanguageLabel,
  REPORT_STATUSES,
  type CivicReport,
} from '../types/civic';

interface ReportDetailPageProps {
  reportId: string;
  cachedReports: CivicReport[];
  verifiedMap: Record<string, boolean>;
  onNavigate: (path: string) => void;
}

export function ReportDetailPage({
  reportId,
  cachedReports,
  verifiedMap,
  onNavigate,
}: ReportDetailPageProps) {
  const { user } = useAuth();
  const cached = cachedReports.find((r) => r.id === reportId) || null;
  const [report, setReport] = useState<CivicReport | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) {
      setReport(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeReportById(
      reportId,
      (res) => {
        setReport(res);
        setLoading(false);
      },
      (err) => {
        setError(formatFirestoreErrorForUi(err, 'Unable to load report.'));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [reportId, cached]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-6">
        <div className="h-8 w-40 rounded-lg bg-[#EFECE5] animate-pulse" />
        <div className="h-80 rounded-xl bg-[#EFECE5] animate-pulse" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">Report not found</h1>
        <p className="text-sm text-[#4F5651]">
          This report may have been removed by its creator or an administrator.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/feed')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg cursor-pointer"
        >
          Back to Community Feed
        </button>
      </div>
    );
  }

  const alreadyVerified = Boolean(verifiedMap[report.id]);
  const currentStepIndex = REPORT_STATUSES.indexOf(report.status);

  const handleVerify = async () => {
    setError(null);
    if (!user) {
      onNavigate(`/auth?next=/reports/${report.id}`);
      return;
    }
    if (!user.emailVerified) {
      setError('Please verify your email address before verifying reports.');
      return;
    }
    if (alreadyVerified || report.status === 'Resolved') return;
    setVerifying(true);
    try {
      await verifyReportExists(report.id, user.uid, report.verificationCount);
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Unable to verify report.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyComplaint = async () => {
    try {
      await navigator.clipboard.writeText(report.complaintText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <button
        type="button"
        onClick={() => onNavigate('/feed')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4F5651] hover:text-[#1A1D1B] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back to Community Feed</span>
      </button>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <StatusIndicator status={report.status} />
              <PriorityIndicator priority={report.prioritySuggestion} />
              <span className="text-xs text-[#717873]">
                {getCategoryLabel(report.category)}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
              {report.title}
            </h1>

            <p className="text-sm text-[#4F5651] flex flex-wrap items-center gap-2">
              <MapPin className="w-4 h-4 text-[#14452F] shrink-0" aria-hidden="true" />
              <span>
                {report.area}
                {report.landmark ? ` (${report.landmark})` : ''}, {report.city}
              </span>
              <span aria-hidden="true">·</span>
              <span>Reported by {report.creatorDisplayName}</span>
            </p>
          </div>

          {/* Photos (Before & Optional After Resolution) */}
          <div className={`grid gap-4 ${report.resolutionImageUrl ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div className="bg-white border border-[#E5E3DC] rounded-xl overflow-hidden">
              <SafeCivicImage
                src={report.imageUrl}
                alt={`Reported street issue: ${report.title}`}
                className="w-full h-72 object-cover"
              />
              <p className="px-4 py-2 text-xs text-[#717873] border-t border-[#E5E3DC]">
                Citizen Field Photograph · Submitted{' '}
                {new Date(report.createdAtMs).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>

            {report.resolutionImageUrl && (
              <div className="bg-white border border-[#A7F3D0] rounded-xl overflow-hidden">
                <SafeCivicImage
                  src={report.resolutionImageUrl}
                  alt={`After-resolution photograph for ${report.title}`}
                  className="w-full h-72 object-cover"
                />
                <p className="px-4 py-2 text-xs font-medium text-[#15803D] border-t border-[#A7F3D0] bg-[#ECFDF5]/60">
                  After-Resolution Verification Photograph
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">Issue Description</h2>
            <p className="text-sm text-[#4F5651] leading-relaxed whitespace-pre-line">
              {report.description}
            </p>
          </div>

          {/* Multilingual Civic Complaint Draft */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                  Civic Complaint Text
                </h2>
                <p className="text-xs text-[#717873]">
                  Language: {getLanguageLabel(report.language)} (Citizen-reviewed draft)
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyComplaint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1A1D1B] bg-[#F3F1EC] border border-[#D4D1C7] rounded-lg hover:bg-[#E8E5DC] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>
            <div className="p-4 rounded-lg bg-[#F8F7F4] border border-[#E5E3DC] text-sm text-[#1A1D1B] leading-relaxed whitespace-pre-line">
              {report.complaintText}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Timeline, Verification & AI Advisory */}
        <aside className="lg:col-span-5 space-y-6">
          {/* Verification Card */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[#717873]">Community Verifications</p>
                <p className="font-mono text-2xl font-bold text-[#1A1D1B] tabular-nums">
                  {report.verificationCount}
                </p>
              </div>
              {report.status !== 'Resolved' ? (
                <button
                  type="button"
                  disabled={alreadyVerified || verifying}
                  onClick={handleVerify}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg min-h-[44px] ${
                    alreadyVerified
                      ? 'bg-[#ECFDF5] text-[#15803D] border border-[#A7F3D0] cursor-default'
                      : 'bg-[#14452F] text-white hover:bg-[#0F3624] cursor-pointer'
                  }`}
                >
                  {verifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : alreadyVerified ? (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ThumbsUp className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{alreadyVerified ? 'You Verified This' : 'Verify Issue Exists'}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Resolved</span>
                </span>
              )}
            </div>

            {report.lat !== null && report.lng !== null && (
              <div className="pt-3 border-t border-[#E5E3DC] flex items-center justify-between text-xs">
                <span className="font-mono text-[#4F5651] tabular-nums">
                  GPS: {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-[#14452F] hover:underline"
                >
                  <span>Open in Maps</span>
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>

          {/* Status Timeline */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">Status Timeline</h2>
            <ol className="space-y-3">
              {REPORT_STATUSES.map((step, idx) => {
                const reached = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono font-bold shrink-0 ${
                        reached
                          ? 'bg-[#14452F] text-white'
                          : 'bg-[#EFECE5] text-[#717873]'
                      }`}
                    >
                      {reached ? '✓' : idx + 1}
                    </span>
                    <div className="flex-1">
                      <p
                        className={`text-sm font-semibold ${
                          isCurrent ? 'text-[#14452F]' : reached ? 'text-[#1A1D1B]' : 'text-[#717873]'
                        }`}
                      >
                        {step}
                      </p>
                      {idx === 0 && (
                        <p className="text-xs text-[#717873] tabular-nums">
                          {new Date(report.createdAtMs).toLocaleString('en-IN')}
                        </p>
                      )}
                      {isCurrent && idx > 0 && (
                        <p className="text-xs text-[#717873] tabular-nums">
                          Updated {new Date(report.updatedAtMs).toLocaleString('en-IN')}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {report.resolutionNotes && (
              <div className="pt-3 border-t border-[#E5E3DC] space-y-1">
                <p className="text-xs font-semibold text-[#1A1D1B]">Official Moderation Notes</p>
                <p className="text-xs text-[#4F5651] leading-relaxed">{report.resolutionNotes}</p>
              </div>
            )}
          </div>

          {/* AI Advisory Card */}
          {report.aiAnalysis && (
            <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                  AI-Assisted Assessment
                </h2>
                <span className="font-mono text-xs text-[#4F5651] tabular-nums">
                  {Math.round(report.aiAnalysis.confidence * 100)}% confidence
                </span>
              </div>
              <p className="text-xs text-[#717873]">
                Advisory model assessment at submission time — not an official safety ruling.
              </p>

              {report.aiAnalysis.visibleEvidence.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#1A1D1B]">Visible Evidence</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-[#4F5651]">
                    {report.aiAnalysis.visibleEvidence.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#1A1D1B]">Priority Reasoning</p>
                <p className="text-xs text-[#4F5651] leading-relaxed">
                  {report.aiAnalysis.priorityReasoning}
                </p>
              </div>

              {report.aiAnalysis.possibleDuplicateIndicators && (
                <div className="space-y-1 pt-2 border-t border-[#E5E3DC]">
                  <p className="text-xs font-semibold text-[#1A1D1B]">Duplicate Check Note</p>
                  <p className="text-xs text-[#4F5651]">
                    {report.aiAnalysis.possibleDuplicateIndicators}
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

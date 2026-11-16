import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, Trash2, Upload, UserPlus } from 'lucide-react';
import { formatRelativeDate, SafeCivicImage, StatusIndicator } from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { BOOTSTRAPPED_ADMIN_EMAIL, formatFirestoreErrorForUi } from '../lib/firebase';
import {
  adminUpdateReportStatus,
  compressImageForUpload,
  grantAdminRole,
  revokeAdminRole,
  subscribeAdminActivity,
  subscribeAdmins,
  uploadResolutionImage,
  validateImageFile,
  type AdminAllowlistEntry,
} from '../lib/reportsService';
import {
  getCategoryLabel,
  PRIORITY_LEVELS,
  REPORT_STATUSES,
  type AdminActivityLog,
  type CivicReport,
  type PriorityLevel,
  type ReportStatus,
} from '../types/civic';

interface AdminDashboardPageProps {
  reports: CivicReport[];
  onNavigate: (path: string) => void;
}

export function AdminDashboardPage({ reports, onNavigate }: AdminDashboardPageProps) {
  const { user, profile, isAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [selectedReport, setSelectedReport] = useState<CivicReport | null>(null);
  const [newStatus, setNewStatus] = useState<ReportStatus>('Under Review');
  const [prioritySuggestion, setPrioritySuggestion] = useState<PriorityLevel>('Medium');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionFile, setResolutionFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);
  const [adminEntries, setAdminEntries] = useState<AdminAllowlistEntry[]>([]);
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [savingAdminRole, setSavingAdminRole] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubActivity = subscribeAdminActivity(
      (logs) => setActivityLogs(logs),
      (err) => setError(formatFirestoreErrorForUi(err, 'Unable to load admin audit log.')),
    );
    const unsubAdmins = subscribeAdmins(
      (entries) => setAdminEntries(entries),
      (err) => setError(formatFirestoreErrorForUi(err, 'Unable to load administrator allowlist.')),
    );
    return () => {
      unsubActivity();
      unsubAdmins();
    };
  }, [isAdmin]);

  if (!user || !isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-[#B45309] mx-auto" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">
          Verified Administrator Access Required
        </h1>
        <p className="text-sm text-[#4F5651]">
          Official status changes, resolution notes, and after-repair photo uploads are restricted
          to verified administrators by Firestore security rules.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/dashboard')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg cursor-pointer"
        >
          Return to Citizen Dashboard
        </button>
      </div>
    );
  }

  const filteredReports = reports.filter((r) =>
    statusFilter === 'all' ? true : r.status === statusFilter,
  );

  const openModeration = (report: CivicReport) => {
    setSelectedReport(report);
    setNewStatus(report.status);
    setPrioritySuggestion(report.prioritySuggestion);
    setResolutionNotes(report.resolutionNotes);
    setResolutionFile(null);
    setError(null);
    setNotice(null);
  };

  const handleSaveModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;

    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      let resolutionImageUrl = selectedReport.resolutionImageUrl || '';
      if (resolutionFile) {
        const validationErr = validateImageFile(resolutionFile);
        if (validationErr) throw new Error(validationErr);
        const compressed = await compressImageForUpload(resolutionFile);
        resolutionImageUrl = await uploadResolutionImage(user.uid, selectedReport.id, compressed.blob);
      }

      await adminUpdateReportStatus({
        reportId: selectedReport.id,
        adminUid: user.uid,
        adminName: profile?.displayName || user.displayName || 'Admin',
        previousStatus: selectedReport.status,
        newStatus,
        prioritySuggestion,
        resolutionNotes,
        resolutionImageUrl,
      });

      setNotice(`Updated report "${selectedReport.title}" to ${newStatus}.`);
      setSelectedReport(null);
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Failed to update report status.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGrantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingAdminRole(true);
    try {
      await grantAdminRole({
        targetUid: newAdminUid,
        targetEmail: newAdminEmail,
        grantedByUid: user.uid,
      });
      setNotice(`Granted verified admin access to ${newAdminEmail.trim()}.`);
      setNewAdminUid('');
      setNewAdminEmail('');
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Unable to grant admin role.'));
    } finally {
      setSavingAdminRole(false);
    }
  };

  const handleRevokeAdmin = async (targetUid: string) => {
    if (targetUid === user.uid) {
      setError('You cannot revoke your own active session admin record.');
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await revokeAdminRole(targetUid);
      setNotice(`Revoked admin allowlist entry for UID ${targetUid}.`);
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Unable to revoke admin role.'));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#14452F] uppercase tracking-wider">
            Moderation &amp; Audit Console
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Admin Review Queue
          </h1>
          <p className="text-sm text-[#4F5651] mt-1">
            Review citizen reports, update official workflow statuses, record notes, and attach
            post-resolution photographs.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              statusFilter === 'all' ? 'bg-[#14452F] text-white' : 'bg-[#EFECE5] text-[#4F5651]'
            }`}
          >
            All ({reports.length})
          </button>
          {REPORT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                statusFilter === s ? 'bg-[#14452F] text-white' : 'bg-[#EFECE5] text-[#4F5651]'
              }`}
            >
              {s} ({reports.filter((r) => r.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#14452F]">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Reports Queue */}
        <div className="lg:col-span-7 space-y-3">
          {filteredReports.length === 0 ? (
            <div className="bg-white border border-[#E5E3DC] rounded-xl p-10 text-center text-sm text-[#4F5651]">
              No reports in this status queue.
            </div>
          ) : (
            filteredReports.map((report) => (
              <div
                key={report.id}
                className={`bg-white border rounded-xl p-4 flex gap-4 items-start transition-colors ${
                  selectedReport?.id === report.id
                    ? 'border-[#14452F] ring-1 ring-[#14452F]'
                    : 'border-[#E5E3DC]'
                }`}
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-[#E5E3DC]">
                  <SafeCivicImage
                    src={report.imageUrl}
                    alt={report.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <StatusIndicator status={report.status} />
                    <span className="text-xs text-[#717873] tabular-nums">
                      {formatRelativeDate(report.createdAtMs)}
                    </span>
                  </div>
                  <h2 className="font-display text-base font-bold text-[#1A1D1B] truncate">
                    {report.title}
                  </h2>
                  <p className="text-xs text-[#4F5651]">
                    {getCategoryLabel(report.category)} · {report.area}, {report.city} ·{' '}
                    <span className="font-mono tabular-nums">
                      {report.verificationCount} verifications
                    </span>
                  </p>
                  <div className="flex items-center gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => openModeration(report)}
                      className="text-xs font-semibold text-[#14452F] hover:underline cursor-pointer"
                    >
                      Review &amp; Update Status
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/reports/${report.id}`)}
                      className="text-xs font-medium text-[#717873] hover:text-[#1A1D1B] cursor-pointer"
                    >
                      Open Detail →
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Moderation Form & Audit Log */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              Official Status Update
            </h2>

            {!selectedReport ? (
              <p className="text-sm text-[#4F5651]">
                Select any report from the queue on the left to update its official status, attach
                resolution notes, or upload an after-repair photo.
              </p>
            ) : (
              <form onSubmit={handleSaveModeration} className="space-y-4">
                <div className="p-3 rounded-lg bg-[#F8F7F4] border border-[#E5E3DC] text-xs space-y-1">
                  <p className="font-semibold text-[#1A1D1B]">{selectedReport.title}</p>
                  <p className="text-[#717873]">
                    {selectedReport.area}, {selectedReport.city} · Current: {selectedReport.status}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">
                      Official Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as ReportStatus)}
                      className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                    >
                      {REPORT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">
                      Priority Level
                    </label>
                    <select
                      value={prioritySuggestion}
                      onChange={(e) => setPrioritySuggestion(e.target.value as PriorityLevel)}
                      className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                    >
                      {PRIORITY_LEVELS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">
                    Resolution / Moderation Notes
                  </label>
                  <textarea
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Record inspection findings, repair dispatch notes, or completion summary..."
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">
                    After-Resolution Photograph (Optional)
                  </label>
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#1A1D1B] bg-[#F3F1EC] border border-[#D4D1C7] rounded-lg hover:bg-[#E8E5DC] cursor-pointer">
                    <Upload className="w-4 h-4 text-[#14452F]" aria-hidden="true" />
                    <span>{resolutionFile ? resolutionFile.name : 'Choose Resolution Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => setResolutionFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedReport(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#4F5651] border border-[#E5E3DC] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                    <span>{saving ? 'Saving...' : 'Save & Log Audit'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Audit Log */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              Recent Admin Activity Log
            </h2>
            {activityLogs.length === 0 ? (
              <p className="text-xs text-[#717873]">No moderation actions logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {activityLogs.slice(0, 12).map((log) => (
                  <li key={log.id} className="pb-3 border-b border-[#E5E3DC] last:border-none text-xs space-y-1">
                    <div className="flex items-center justify-between text-[#717873]">
                      <span className="font-semibold text-[#1A1D1B]">{log.adminName}</span>
                      <span className="tabular-nums">{formatRelativeDate(log.createdAtMs)}</span>
                    </div>
                    <p className="text-[#4F5651]">
                      {log.previousStatus} → <strong>{log.newStatus}</strong>
                    </p>
                    {log.note && <p className="text-[#717873]">{log.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Role-Based Admin Allowlist */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                Verified Admin Permissions
              </h2>
              <p className="text-xs text-[#717873]">
                Primary admin: <span className="font-mono">{BOOTSTRAPPED_ADMIN_EMAIL}</span>. Add
                additional moderators by Firebase UID.
              </p>
            </div>

            <form onSubmit={handleGrantAdmin} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newAdminUid}
                  onChange={(e) => setNewAdminUid(e.target.value)}
                  placeholder="Firebase User UID"
                  className="px-3 py-2 text-xs font-mono border border-[#D4D1C7] rounded-lg"
                />
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  className="px-3 py-2 text-xs border border-[#D4D1C7] rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={savingAdminRole}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{savingAdminRole ? 'Granting...' : 'Grant Admin Role'}</span>
              </button>
            </form>

            {adminEntries.length > 0 && (
              <ul className="space-y-2 pt-2 border-t border-[#E5E3DC]">
                {adminEntries.map((entry) => (
                  <li
                    key={entry.uid}
                    className="flex items-center justify-between gap-2 text-xs py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#1A1D1B] truncate">{entry.email}</p>
                      <p className="font-mono text-[11px] text-[#717873] truncate">{entry.uid}</p>
                    </div>
                    {entry.uid !== user.uid && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeAdmin(entry.uid)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#991B1B] border border-[#FECACA] rounded hover:bg-[#FEF2F2] shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                        <span>Revoke</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

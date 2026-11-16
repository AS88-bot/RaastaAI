import React, { useEffect, useState } from 'react';
import { Edit3, LogOut, PlusCircle, Shield, Trash2 } from 'lucide-react';
import { formatRelativeDate, SafeCivicImage, StatusIndicator } from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { formatFirestoreErrorForUi } from '../lib/firebase';
import { deleteReport, subscribeUserReports, updateCreatorReport } from '../lib/reportsService';
import {
  getCategoryLabel,
  ISSUE_CATEGORIES,
  SUPPORTED_LANGUAGES,
  type CivicReport,
  type IssueCategory,
  type SupportedLanguage,
} from '../types/civic';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user, profile, isAdmin, authLoading, signOutUser, updateUserSettings } = useAuth();
  const [myReports, setMyReports] = useState<CivicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings form
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [city, setCity] = useState(profile?.city || 'Hyderabad');
  const [preferredLanguage, setPreferredLanguage] = useState<SupportedLanguage>(
    profile?.preferredLanguage || 'en',
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Inline report edit modal state
  const [editingReport, setEditingReport] = useState<CivicReport | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editComplaint, setEditComplaint] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [editCategory, setEditCategory] = useState<IssueCategory>('pothole');
  const [savingReport, setSavingReport] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setCity(profile.city);
      setPreferredLanguage(profile.preferredLanguage);
    }
  }, [profile]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeUserReports(
      user.uid,
      (items) => {
        setMyReports(items);
        setLoading(false);
      },
      (err) => {
        setError(formatFirestoreErrorForUi(err, 'Unable to load your reports.'));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, authLoading]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">
          Sign in to view your Citizen Dashboard
        </h1>
        <p className="text-sm text-[#4F5651]">
          Track your submitted street reports, edit drafts under review, and check community
          verifications.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/auth?next=/dashboard')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
        >
          Go to Sign In
        </button>
      </div>
    );
  }

  const total = myReports.length;
  const pending = myReports.filter((r) => r.status !== 'Resolved').length;
  const resolved = myReports.filter((r) => r.status === 'Resolved').length;
  const verificationsReceived = myReports.reduce((s, r) => s + r.verificationCount, 0);

  const openEditModal = (report: CivicReport) => {
    setEditingReport(report);
    setEditTitle(report.title);
    setEditDescription(report.description);
    setEditComplaint(report.complaintText);
    setEditArea(report.area);
    setEditLandmark(report.landmark);
    setEditCategory(report.category);
  };

  const handleSaveReportEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport) return;
    setSavingReport(true);
    setError(null);
    try {
      await updateCreatorReport(editingReport.id, {
        title: editTitle,
        description: editDescription,
        complaintText: editComplaint,
        area: editArea,
        landmark: editLandmark,
        category: editCategory,
      });
      setEditingReport(null);
      setActionNotice('Report updated successfully.');
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Unable to update report.'));
    } finally {
      setSavingReport(false);
    }
  };

  const handleWithdrawReport = async (reportId: string) => {
    setError(null);
    try {
      await deleteReport(reportId);
      setActionNotice('Draft report removed.');
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Failed to delete report.'));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateUserSettings({ displayName, city, preferredLanguage });
      setEditingProfile(false);
      setActionNotice('Profile preferences saved.');
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Failed to update profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Welcome back, {profile?.displayName || user.displayName || 'Citizen'}
          </h1>
          <p className="text-sm text-[#4F5651] mt-1">
            {profile?.city || 'Hyderabad'} · Role: {isAdmin ? 'Verified Administrator' : 'Citizen Reporter'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('/admin')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#14452F] bg-white border border-[#14452F]/30 rounded-lg hover:bg-[#F3F1EC] cursor-pointer"
            >
              <Shield className="w-4 h-4" aria-hidden="true" />
              <span>Admin Console</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('/report')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>New Report</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOutUser();
              onNavigate('/');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#4F5651] bg-white border border-[#E5E3DC] rounded-lg hover:text-[#1A1D1B] cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-sm text-[#14452F]">
          {actionNotice}
        </div>
      )}
      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Your Total Reports</p>
          <p className="font-mono text-2xl font-semibold text-[#1A1D1B] mt-1 tabular-nums">
            {loading ? '—' : total}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Pending &amp; Active</p>
          <p className="font-mono text-2xl font-semibold text-[#B45309] mt-1 tabular-nums">
            {loading ? '—' : pending}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Resolved</p>
          <p className="font-mono text-2xl font-semibold text-[#15803D] mt-1 tabular-nums">
            {loading ? '—' : resolved}
          </p>
        </div>
        <div className="bg-white border border-[#E5E3DC] rounded-xl p-5">
          <p className="text-xs font-medium text-[#717873]">Verifications Received</p>
          <p className="font-mono text-2xl font-semibold text-[#14452F] mt-1 tabular-nums">
            {loading ? '—' : verificationsReceived}
          </p>
        </div>
      </div>

      {/* Main Content + Profile Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#1A1D1B]">Your Recent Reports</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-24 rounded-xl bg-[#EFECE5] animate-pulse" />
              ))}
            </div>
          ) : myReports.length === 0 ? (
            <div className="bg-white border border-[#E5E3DC] rounded-xl p-10 text-center space-y-3">
              <p className="font-display text-lg font-bold text-[#1A1D1B]">
                You haven&apos;t submitted any reports yet
              </p>
              <p className="text-sm text-[#4F5651] max-w-md mx-auto">
                Snap a photograph of a pothole, broken streetlight, or water leak to generate a
                verified civic record.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('/report')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
              >
                Report an Issue
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {myReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white border border-[#E5E3DC] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 justify-between"
                >
                  <div className="flex gap-4 min-w-0">
                    <div className="w-24 h-20 rounded-lg overflow-hidden shrink-0 border border-[#E5E3DC]">
                      <SafeCivicImage
                        src={report.imageUrl}
                        alt={report.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusIndicator status={report.status} />
                        <span className="text-xs text-[#717873] tabular-nums">
                          {formatRelativeDate(report.createdAtMs)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/reports/${report.id}`)}
                        className="text-left font-display text-base font-bold text-[#1A1D1B] hover:text-[#14452F] truncate block max-w-full cursor-pointer"
                      >
                        {report.title}
                      </button>
                      <p className="text-xs text-[#717873]">
                        {getCategoryLabel(report.category)} · {report.area}, {report.city} ·{' '}
                        <span className="font-mono tabular-nums">
                          {report.verificationCount} verifications
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigate(`/reports/${report.id}`)}
                      className="text-xs font-semibold text-[#14452F] hover:underline cursor-pointer"
                    >
                      View Details →
                    </button>
                    {report.status === 'Submitted' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(report)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#4F5651] border border-[#E5E3DC] rounded-md hover:bg-[#F3F1EC] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWithdrawReport(report.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#991B1B] border border-[#FECACA] rounded-md hover:bg-[#FEF2F2] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile Card + Recent Activity */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#1A1D1B]">Account Preferences</h2>
              <button
                type="button"
                onClick={() => setEditingProfile((prev) => !prev)}
                className="text-xs font-semibold text-[#14452F] hover:underline cursor-pointer"
              >
                {editingProfile ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editingProfile ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">Default City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1B] mb-1">
                    Complaint Language
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value as SupportedLanguage)}
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label} ({l.nativeLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Preferences'}
                </button>
              </form>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[#717873]">Public Reporter Name</dt>
                  <dd className="font-medium text-[#1A1D1B]">{profile?.displayName || 'Citizen'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#717873]">Private Email (Never Public)</dt>
                  <dd className="font-medium text-[#1A1D1B] break-all">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#717873]">City &amp; Language</dt>
                  <dd className="font-medium text-[#1A1D1B]">
                    {profile?.city || 'Hyderabad'} ·{' '}
                    {SUPPORTED_LANGUAGES.find((l) => l.value === profile?.preferredLanguage)?.label ||
                      'English'}
                  </dd>
                </div>
              </dl>
            )}
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">Recent Activity</h2>
            {loading ? (
              <div className="h-20 rounded-lg bg-[#EFECE5] animate-pulse" />
            ) : myReports.length === 0 ? (
              <p className="text-xs text-[#717873]">
                Activity from your submitted reports, community verifications, and status updates
                will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {[...myReports]
                  .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
                  .slice(0, 6)
                  .map((r) => (
                    <li
                      key={`act_${r.id}`}
                      className="pb-3 border-b border-[#E5E3DC] last:border-none last:pb-0 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusIndicator status={r.status} />
                        <span className="text-[#717873] tabular-nums">
                          {formatRelativeDate(r.updatedAtMs)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/reports/${r.id}`)}
                        className="text-left font-medium text-[#1A1D1B] hover:text-[#14452F] line-clamp-1 cursor-pointer"
                      >
                        {r.title}
                      </button>
                      <p className="text-[#717873]">
                        {r.verificationCount > 0
                          ? `${r.verificationCount} community ${r.verificationCount === 1 ? 'verification' : 'verifications'}`
                          : 'Awaiting neighborhood verification'}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Edit Submitted Report Modal */}
      {editingReport && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-report-heading"
        >
          <div className="bg-white border border-[#E5E3DC] rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 id="edit-report-heading" className="font-display text-xl font-bold text-[#1A1D1B]">
              Edit Submitted Report
            </h2>
            <form onSubmit={handleSaveReportEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Title</label>
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={140}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as IssueCategory)}
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  >
                    {ISSUE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Street / Area</label>
                  <input
                    type="text"
                    required
                    value={editArea}
                    onChange={(e) => setEditArea(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Landmark</label>
                <input
                  type="text"
                  value={editLandmark}
                  onChange={(e) => setEditLandmark(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Description</label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Complaint Text</label>
                <textarea
                  rows={4}
                  required
                  minLength={10}
                  value={editComplaint}
                  onChange={(e) => setEditComplaint(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D4D1C7] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReport(null)}
                  className="px-4 py-2 text-sm font-medium text-[#4F5651] border border-[#E5E3DC] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReport}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
                >
                  {savingReport ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

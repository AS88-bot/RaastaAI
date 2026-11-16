import { ArrowRight, Camera, Languages, MapPin, ShieldCheck } from 'lucide-react';
import { formatRelativeDate, SafeCivicImage, StatusIndicator } from '../components/StatusIndicator';
import { useAuth } from '../context/AuthContext';
import { getCategoryLabel, type CivicReport } from '../types/civic';

interface LandingPageProps {
  reports: CivicReport[];
  loading: boolean;
  onNavigate: (path: string) => void;
}

export function LandingPage({ reports, loading, onNavigate }: LandingPageProps) {
  const { user } = useAuth();

  const totalReports = reports.length;
  const totalVerifications = reports.reduce((sum, r) => sum + (r.verificationCount || 0), 0);
  const activeCount = reports.filter((r) => r.status !== 'Resolved').length;
  const resolvedCount = reports.filter((r) => r.status === 'Resolved').length;

  const recentReports = reports.slice(0, 3);

  return (
    <div className="space-y-20 pb-8">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 lg:pt-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-2 space-y-6">
            <div className="space-y-5">
              <p className="text-xs font-semibold tracking-wider uppercase text-[#14452F]">
                Hyderabad Civic Infrastructure Platform
              </p>
              <h1
                className="font-display font-bold tracking-tight text-[#1A1D1B] leading-[1.08]"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.65rem)',
                  textWrap: 'balance',
                }}
              >
                Better Streets Begin With One Report.
              </h1>
              <p className="text-base sm:text-lg text-[#4F5651] leading-relaxed max-w-xl">
                Unreported potholes, overflowing garbage bins, leaking water mains, and broken
                streetlights stall daily commutes across Indian neighborhoods. RaastaAI turns a
                single street photo or voice note into a structured, multilingual civic report
                tracked openly by the community.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => onNavigate(user ? '/report' : '/auth?next=/report')}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] transition-colors min-h-[44px] whitespace-nowrap cursor-pointer"
              >
                <span>Report an Issue</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/map')}
                className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#1A1D1B] bg-white border border-[#E5E3DC] rounded-lg hover:bg-[#F3F1EC] transition-colors min-h-[44px] whitespace-nowrap cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-[#14452F]" aria-hidden="true" />
                <span>Explore Community Map</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[440px] rounded-xl overflow-hidden border border-[#E5E3DC] bg-[#EFECE5]">
              <SafeCivicImage
                src="/src/assets/images/hero_hyderabad_street_1794809985307.jpg"
                alt="Tree-lined urban street corridor in Hyderabad at golden hour"
                className="w-full h-full object-cover"
                fallbackLabel="Hyderabad street corridor"
              />
            </div>
          </div>
        </div>

        {/* Live Database Impact Strip */}
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white border border-[#E5E3DC] rounded-xl p-6">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#717873]">Reports Logged (Live DB)</p>
            <p className="font-mono text-2xl sm:text-3xl font-semibold text-[#1A1D1B] tabular-nums">
              {loading ? '—' : totalReports}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#717873]">Community Verifications</p>
            <p className="font-mono text-2xl sm:text-3xl font-semibold text-[#1A1D1B] tabular-nums">
              {loading ? '—' : totalVerifications}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#717873]">Open &amp; Active Issues</p>
            <p className="font-mono text-2xl sm:text-3xl font-semibold text-[#B45309] tabular-nums">
              {loading ? '—' : activeCount}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#717873]">Verified Resolved</p>
            <p className="font-mono text-2xl sm:text-3xl font-semibold text-[#15803D] tabular-nums">
              {loading ? '—' : resolvedCount}
            </p>
          </div>
        </div>
      </section>

      {/* Problem -> Solution Asymmetric Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl space-y-3 mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Built for how Indian neighborhoods actually report streets
          </h2>
          <p className="text-base text-[#4F5651] leading-relaxed">
            Most civic portals demand long English-only forms and obscure ward codes. RaastaAI pairs
            field photography with multimodal Gemini triage while keeping citizens in full control.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#14452F]">
                <Camera className="w-4 h-4" aria-hidden="true" />
                <span>Multimodal Visual &amp; Voice Triage</span>
              </div>
              <h3 className="font-display text-xl font-bold text-[#1A1D1B]">
                Photo + voice note in, structured civic grievance out
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed max-w-2xl">
                Upload a street photograph or capture one directly on mobile, optionally record a
                brief voice note, and let Gemini inspect visible evidence, flag blurriness when
                clarification is needed, suggest priority with transparent reasoning, and check for
                nearby duplicate reports before you submit.
              </p>
            </div>
            <div className="pt-4 border-t border-[#E5E3DC] flex flex-wrap gap-6 text-xs text-[#4F5651]">
              <span>6 Infrastructure Categories</span>
              <span aria-hidden="true">·</span>
              <span>Advisory Confidence Scores</span>
              <span aria-hidden="true">·</span>
              <span>Human Review Before Submit</span>
            </div>
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#14452F]">
                <Languages className="w-4 h-4" aria-hidden="true" />
                <span>Multilingual Drafts</span>
              </div>
              <h3 className="font-display text-xl font-bold text-[#1A1D1B]">
                English, Telugu, Hindi &amp; Urdu
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Generate clear, respectful civic complaints in your preferred regional language, edit
                every sentence directly, and copy or submit into the public tracker.
              </p>
            </div>
            <div className="pt-4 border-t border-[#E5E3DC] text-xs text-[#717873]">
              తెలుగు · हिन्दी · اردو · English
            </div>
          </div>

          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#14452F]">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>Community Verification</span>
            </div>
            <h3 className="font-display text-xl font-bold text-[#1A1D1B]">
              One-click neighborhood corroboration
            </h3>
            <p className="text-sm text-[#4F5651] leading-relaxed">
              Residents passing the same junction can confirm an issue still persists. Each account
              can verify once per report, preventing duplicate inflation.
            </p>
          </div>

          <div className="md:col-span-2 bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-center">
            <div className="w-full sm:w-56 h-40 rounded-lg overflow-hidden shrink-0 border border-[#E5E3DC]">
              <SafeCivicImage
                src="/src/assets/images/civic_inspection_pavement_1794809985721.jpg"
                alt="Repaired footpath curb and drainage grate in an Indian neighborhood"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2.5">
              <h3 className="font-display text-xl font-bold text-[#1A1D1B]">
                Role-protected resolution &amp; after-photos
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Official status transitions—Submitted, Under Review, In Progress, and Resolved—are
                locked strictly to verified administrators with audit logs and before/after visual
                proof.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#F3F1EC] border border-[#E5E3DC] rounded-xl p-6 sm:p-10">
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#1A1D1B] mb-8">
            How a street report moves from photo to resolution
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold text-[#14452F]">01</p>
              <h3 className="font-display text-base font-bold text-[#1A1D1B]">
                Capture street evidence
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Take a photo, add optional voice context, mark the road or landmark, and attach GPS
                coordinates if available.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold text-[#14452F]">02</p>
              <h3 className="font-display text-base font-bold text-[#1A1D1B]">
                Review AI-drafted complaint
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Gemini highlights visible evidence and drafts a formal complaint in English, Telugu,
                Hindi, or Urdu for you to edit.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold text-[#14452F]">03</p>
              <h3 className="font-display text-base font-bold text-[#1A1D1B]">
                Verify on feed &amp; map
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Neighbors view active issues on the community feed and map, confirming unresolved
                hazards with one verification per user.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-xs font-semibold text-[#14452F]">04</p>
              <h3 className="font-display text-base font-bold text-[#1A1D1B]">
                Track audited resolution
              </h3>
              <p className="text-sm text-[#4F5651] leading-relaxed">
                Authorized reviewers update official status, record resolution notes, and upload
                after-repair photographs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Real Database Recent Reports Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#1A1D1B]">
              Recent Community Reports
            </h2>
            <p className="text-sm text-[#4F5651] mt-1">
              Live public records stored in Firestore across active neighborhoods.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/feed')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#14452F] hover:underline whitespace-nowrap cursor-pointer"
          >
            <span>View all reports</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {recentReports.length === 0 ? (
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-10 text-center space-y-4">
            <p className="font-display text-lg font-bold text-[#1A1D1B]">
              No civic reports submitted yet
            </p>
            <p className="text-sm text-[#4F5651] max-w-md mx-auto">
              RaastaAI never displays synthetic placeholder issues. Be the first citizen in your
              neighborhood to document a street issue and verify the live workflow.
            </p>
            <div>
              <button
                type="button"
                onClick={() => onNavigate(user ? '/report' : '/auth?next=/report')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
              >
                Submit First Report
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentReports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => onNavigate(`/reports/${report.id}`)}
                className="text-left bg-white border border-[#E5E3DC] rounded-xl overflow-hidden hover:border-[#14452F]/50 transition-colors flex flex-col cursor-pointer"
              >
                <SafeCivicImage
                  src={report.imageUrl}
                  alt={report.title}
                  className="w-full h-44 object-cover"
                />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <StatusIndicator status={report.status} />
                      <span className="text-xs text-[#717873] tabular-nums">
                        {formatRelativeDate(report.createdAtMs)}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-[#1A1D1B] line-clamp-2">
                      {report.title}
                    </h3>
                    <p className="text-xs text-[#717873]">
                      {getCategoryLabel(report.category)} · {report.area}, {report.city}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-[#E5E3DC] flex items-center justify-between text-xs text-[#4F5651]">
                    <span className="font-mono tabular-nums">
                      {report.verificationCount} verifications
                    </span>
                    <span className="font-semibold text-[#14452F]">Inspect →</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

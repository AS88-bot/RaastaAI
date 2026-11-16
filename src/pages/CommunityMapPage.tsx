import { useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { ExternalLink, List, MapPin, Navigation } from 'lucide-react';
import { OpenStreetCivicMap } from '../components/OpenStreetCivicMap';
import { formatRelativeDate, SafeCivicImage, StatusIndicator } from '../components/StatusIndicator';
import {
  getCategoryLabel,
  ISSUE_CATEGORIES,
  REPORT_STATUSES,
  type CivicReport,
  type IssueCategory,
  type ReportStatus,
} from '../types/civic';

interface CommunityMapPageProps {
  reports: CivicReport[];
  loading: boolean;
  mapsApiKey: string;
  quotaExceeded: boolean;
  onNavigate: (path: string) => void;
}

function getPinColors(status: ReportStatus): { background: string; borderColor: string; glyphColor: string } {
  switch (status) {
    case 'Resolved':
      return { background: '#15803D', borderColor: '#14532D', glyphColor: '#FFFFFF' };
    case 'In Progress':
      return { background: '#0F766E', borderColor: '#134E4A', glyphColor: '#FFFFFF' };
    case 'Under Review':
      return { background: '#B45309', borderColor: '#78350F', glyphColor: '#FFFFFF' };
    default:
      return { background: '#14452F', borderColor: '#0A291B', glyphColor: '#FFFFFF' };
  }
}

function ReportMapMarker({
  report,
  isSelected,
  onSelect,
  onClose,
  onOpenDetail,
}: {
  report: CivicReport;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onOpenDetail: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const colors = getPinColors(report.status);

  if (report.lat === null || report.lng === null) return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: report.lat, lng: report.lng }}
        onClick={onSelect}
        title={report.title}
      >
        <Pin
          background={colors.background}
          borderColor={colors.borderColor}
          glyphColor={colors.glyphColor}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={280}>
          <div className="p-1 space-y-2 text-[#1A1D1B]">
            <div className="w-full h-28 rounded-md overflow-hidden bg-[#EFECE5]">
              <SafeCivicImage
                src={report.imageUrl}
                alt={report.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-1">
              <StatusIndicator status={report.status} />
              <h3 className="font-display text-sm font-bold leading-snug">{report.title}</h3>
              <p className="text-xs text-[#4F5651]">
                {getCategoryLabel(report.category)} · {report.area}, {report.city}
              </p>
              <p className="text-xs font-mono text-[#717873] tabular-nums">
                {report.verificationCount} verifications
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenDetail}
              className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-[#14452F] rounded-md hover:bg-[#0F3624] cursor-pointer"
            >
              Inspect Report →
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function CommunityMapPage({
  reports,
  loading,
  mapsApiKey,
  quotaExceeded,
  onNavigate,
}: CommunityMapPageProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | IssueCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  const filteredReports = reports.filter((r) => {
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const geoReports = filteredReports.filter((r) => r.lat !== null && r.lng !== null);
  const nonGeoReports = filteredReports.filter((r) => r.lat === null || r.lng === null);

  const hasGoogleMaps = Boolean(mapsApiKey) && !quotaExceeded;
  const canRenderMap = viewMode === 'map';

  const defaultCenter =
    geoReports.length > 0 && geoReports[0].lat !== null && geoReports[0].lng !== null
      ? { lat: geoReports[0].lat, lng: geoReports[0].lng }
      : { lat: 17.385, lng: 78.4867 }; // Hyderabad center

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
            Community Issue Map
          </h1>
          <p className="text-sm text-[#4F5651] mt-1">
            Explore geolocated street reports across Hyderabad and surrounding corridors. Click any
            marker to inspect evidence and status.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EFECE5] rounded-lg self-start">
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              viewMode === 'map' ? 'bg-white text-[#1A1D1B] shadow-xs' : 'text-[#4F5651]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Map View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              viewMode === 'list' ? 'bg-white text-[#1A1D1B] shadow-xs' : 'text-[#4F5651]'
            }`}
          >
            <List className="w-3.5 h-3.5" aria-hidden="true" />
            <span>List Fallback</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-[#E5E3DC] rounded-xl p-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-[#14452F] text-white'
                : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
            }`}
          >
            All Categories
          </button>
          {ISSUE_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategoryFilter(cat.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                categoryFilter === cat.value
                  ? 'bg-[#14452F] text-white'
                  : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#1A1D1B] text-white'
                : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
            }`}
          >
            All Statuses
          </button>
          {REPORT_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#1A1D1B] text-white'
                  : 'bg-[#F3F1EC] text-[#4F5651] hover:text-[#1A1D1B]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Map (Google Maps when configured, otherwise OpenStreetMap) OR List View */}
      {canRenderMap ? (
        <div className="space-y-4">
          <div className="h-[380px] sm:h-[520px] w-full rounded-xl overflow-hidden border border-[#E5E3DC] bg-[#EFECE5] relative">
            {hasGoogleMaps ? (
              <APIProvider apiKey={mapsApiKey} language="en" region="IN">
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={defaultCenter}
                  defaultZoom={12}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {geoReports.map((report) => (
                    <ReportMapMarker
                      key={report.id}
                      report={report}
                      isSelected={selectedReportId === report.id}
                      onSelect={() => setSelectedReportId(report.id)}
                      onClose={() => setSelectedReportId(null)}
                      onOpenDetail={() => onNavigate(`/reports/${report.id}`)}
                    />
                  ))}
                </GoogleMap>
              </APIProvider>
            ) : (
              <OpenStreetCivicMap
                reports={geoReports}
                defaultCenter={defaultCenter}
                selectedReportId={selectedReportId}
                onSelectReport={setSelectedReportId}
                onOpenDetail={(id) => onNavigate(`/reports/${id}`)}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#717873]">
            <span>
              Showing <strong className="font-mono text-[#1A1D1B]">{geoReports.length}</strong>{' '}
              geolocated reports on {hasGoogleMaps ? 'Google Maps' : 'OpenStreetMap'} (
              {nonGeoReports.length} address-only reports listed below).
            </span>
            <span>Green: Submitted / Resolved · Amber: Under Review · Teal: In Progress</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-24 rounded-xl bg-[#EFECE5] animate-pulse" />
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="bg-white border border-[#E5E3DC] rounded-xl p-10 text-center space-y-2">
              <p className="font-display text-lg font-bold text-[#1A1D1B]">
                No reports match the active map filters
              </p>
              <p className="text-sm text-[#4F5651]">
                Adjust category or status filters, or submit a new street report with GPS
                coordinates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white border border-[#E5E3DC] rounded-xl p-4 flex gap-4 items-start"
                >
                  <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0 border border-[#E5E3DC]">
                    <SafeCivicImage
                      src={report.imageUrl}
                      alt={report.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <StatusIndicator status={report.status} />
                      <span className="text-xs text-[#717873] tabular-nums">
                        {formatRelativeDate(report.createdAtMs)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/reports/${report.id}`)}
                      className="text-left font-display text-base font-bold text-[#1A1D1B] hover:text-[#14452F] line-clamp-1 cursor-pointer"
                    >
                      {report.title}
                    </button>
                    <p className="text-xs text-[#4F5651]">
                      {getCategoryLabel(report.category)} · {report.area}, {report.city}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      {report.lat !== null && report.lng !== null ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${report.lat},${report.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[#14452F] hover:underline"
                        >
                          <Navigation className="w-3 h-3" aria-hidden="true" />
                          <span>
                            {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                          </span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-[#717873]">Street-level location only</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate(`/reports/${report.id}`)}
                        className="font-semibold text-[#14452F] hover:underline ml-auto cursor-pointer"
                      >
                        Details →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Non-geolocated reports directory when map is open */}
      {canRenderMap && nonGeoReports.length > 0 && (
        <div className="space-y-3 pt-4">
          <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
            Address-Only Reports (No GPS Coordinates Attached)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nonGeoReports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onNavigate(`/reports/${r.id}`)}
                className="text-left bg-white border border-[#E5E3DC] rounded-xl p-4 hover:border-[#14452F]/50 transition-colors space-y-1.5 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <StatusIndicator status={r.status} />
                  <span className="text-xs text-[#717873] tabular-nums">
                    {formatRelativeDate(r.createdAtMs)}
                  </span>
                </div>
                <p className="font-display text-sm font-bold text-[#1A1D1B] line-clamp-1">
                  {r.title}
                </p>
                <p className="text-xs text-[#4F5651]">
                  {getCategoryLabel(r.category)} · {r.area}, {r.city}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

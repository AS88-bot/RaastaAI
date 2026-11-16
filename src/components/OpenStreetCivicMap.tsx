import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';
import { SafeCivicImage, StatusIndicator } from './StatusIndicator';
import { getCategoryLabel, type CivicReport, type ReportStatus } from '../types/civic';

interface OpenStreetCivicMapProps {
  reports: CivicReport[];
  defaultCenter: { lat: number; lng: number };
  selectedReportId: string | null;
  onSelectReport: (reportId: string | null) => void;
  onOpenDetail: (reportId: string) => void;
}

function getMarkerColors(status: ReportStatus): { fill: string; stroke: string } {
  switch (status) {
    case 'Resolved':
      return { fill: '#15803D', stroke: '#14532D' };
    case 'In Progress':
      return { fill: '#0F766E', stroke: '#134E4A' };
    case 'Under Review':
      return { fill: '#B45309', stroke: '#78350F' };
    default:
      return { fill: '#14452F', stroke: '#0A291B' };
  }
}

export function OpenStreetCivicMap({
  reports,
  defaultCenter,
  selectedReportId,
  onSelectReport,
  onOpenDetail,
}: OpenStreetCivicMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const lastBoundsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: [defaultCenter.lat, defaultCenter.lng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    map.on('click', () => {
      onSelectReport(null);
    });

    mapRef.current = map;
    markersLayerRef.current = layer;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      lastBoundsKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const coords: Array<[number, number]> = [];
    for (const report of reports) {
      if (report.lat === null || report.lng === null) continue;
      coords.push([report.lat, report.lng]);

      const { fill, stroke } = getMarkerColors(report.status);
      const isSelected = report.id === selectedReportId;

      const marker = L.circleMarker([report.lat, report.lng], {
        radius: isSelected ? 11 : 8,
        fillColor: fill,
        color: stroke,
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.92,
      });

      marker.bindTooltip(report.title, { direction: 'top', offset: [0, -8] });
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        onSelectReport(report.id);
      });
      marker.addTo(layer);
    }

    const boundsKey = coords.map(([lat, lng]) => `${lat},${lng}`).join('|');
    if (boundsKey !== lastBoundsKeyRef.current) {
      lastBoundsKeyRef.current = boundsKey;
      if (coords.length === 1) {
        map.setView(coords[0], 14);
      } else if (coords.length > 1) {
        map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
      } else {
        map.setView([defaultCenter.lat, defaultCenter.lng], 12);
      }
    }
  }, [reports, selectedReportId, defaultCenter.lat, defaultCenter.lng]);

  const selectedReport = selectedReportId
    ? reports.find((r) => r.id === selectedReportId) || null
    : null;

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full z-0"
        aria-label="Interactive OpenStreetMap of civic infrastructure reports"
      />

      {selectedReport && (
        <div
          role="dialog"
          aria-label={selectedReport.title}
          className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-72 z-[500] bg-white border border-[#E5E3DC] rounded-xl shadow-lg p-3 space-y-2 text-[#1A1D1B]"
        >
          <div className="relative w-full h-28 rounded-md overflow-hidden bg-[#EFECE5]">
            <SafeCivicImage
              src={selectedReport.imageUrl}
              alt={selectedReport.title}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onSelectReport(null)}
              aria-label="Close report preview"
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-[#1A1D1B] flex items-center justify-center shadow-xs hover:bg-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-1">
            <StatusIndicator status={selectedReport.status} />
            <h3 className="font-display text-sm font-bold leading-snug line-clamp-2">
              {selectedReport.title}
            </h3>
            <p className="text-xs text-[#4F5651]">
              {getCategoryLabel(selectedReport.category)} · {selectedReport.area}, {selectedReport.city}
            </p>
            <p className="text-xs font-mono text-[#717873] tabular-nums">
              {selectedReport.verificationCount} verifications
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenDetail(selectedReport.id)}
            className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-[#14452F] rounded-md hover:bg-[#0F3624] cursor-pointer"
          >
            Inspect Report →
          </button>
        </div>
      )}
    </div>
  );
}

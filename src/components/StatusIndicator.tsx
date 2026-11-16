import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  ImageOff,
  Wrench,
} from 'lucide-react';
import type { PriorityLevel, ReportStatus } from '../types/civic';

export function StatusIndicator({ status }: { status: ReportStatus }) {
  switch (status) {
    case 'Submitted':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Submitted</span>
        </span>
      );
    case 'Under Review':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
          <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Under Review</span>
        </span>
      );
    case 'In Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F766E] whitespace-nowrap">
          <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>In Progress</span>
        </span>
      );
    case 'Resolved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Resolved</span>
        </span>
      );
  }
}

export function PriorityIndicator({ priority }: { priority: PriorityLevel }) {
  const colorClass =
    priority === 'Urgent'
      ? 'text-[#B91C1C]'
      : priority === 'High'
        ? 'text-[#C2410C]'
        : priority === 'Medium'
          ? 'text-[#A16207]'
          : 'text-[#4F5651]';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${colorClass}`}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{priority} priority (suggested)</span>
    </span>
  );
}

export function SafeCivicImage({
  src,
  alt,
  className = 'w-full h-48 object-cover',
  fallbackLabel = 'Civic photograph unavailable',
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`${className} bg-[#EFECE5] flex flex-col items-center justify-center gap-2 text-[#717873] p-4 text-center`}
      >
        <ImageOff className="w-6 h-6 text-[#8C938E]" aria-hidden="true" />
        <span className="text-xs font-medium">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function formatRelativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

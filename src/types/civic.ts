export type IssueCategory =
  | 'pothole'
  | 'garbage'
  | 'water_leakage'
  | 'damaged_footpath'
  | 'broken_streetlight'
  | 'other';

export type ReportStatus = 'Submitted' | 'Under Review' | 'In Progress' | 'Resolved';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Urgent';

export type SupportedLanguage = 'en' | 'te' | 'hi' | 'ur';

export const ISSUE_CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: 'pothole', label: 'Pothole' },
  { value: 'garbage', label: 'Overflowing Garbage' },
  { value: 'water_leakage', label: 'Water Leakage' },
  { value: 'damaged_footpath', label: 'Damaged Footpath' },
  { value: 'broken_streetlight', label: 'Broken Streetlight' },
  { value: 'other', label: 'Other Infrastructure' },
];

export const REPORT_STATUSES: ReportStatus[] = [
  'Submitted',
  'Under Review',
  'In Progress',
  'Resolved',
];

export const PRIORITY_LEVELS: PriorityLevel[] = ['Low', 'Medium', 'High', 'Urgent'];

export const SUPPORTED_LANGUAGES: { value: SupportedLanguage; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'te', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { value: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { value: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
];

export interface AiReportAnalysis {
  suggestedCategory: IssueCategory;
  conciseDescription: string;
  visibleEvidence: string[];
  suggestedPriority: PriorityLevel;
  priorityReasoning: string;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string;
  possibleDuplicateIndicators: string;
  generatedComplaint?: string;
  conciseTitle?: string;
  analyzedAt: string;
}

export interface CivicReport {
  id: string;
  creatorUid: string;
  creatorDisplayName: string;
  category: IssueCategory;
  title: string;
  description: string;
  complaintText: string;
  language: SupportedLanguage;
  area: string;
  landmark: string;
  city: string;
  lat: number | null;
  lng: number | null;
  imageUrl: string;
  aiAnalysis: AiReportAnalysis | null;
  prioritySuggestion: PriorityLevel;
  status: ReportStatus;
  verificationCount: number;
  resolutionNotes: string;
  resolutionImageUrl: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  city: string;
  preferredLanguage: SupportedLanguage;
  role: 'citizen' | 'admin';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AdminActivityLog {
  id: string;
  reportId: string;
  adminUid: string;
  adminName: string;
  previousStatus: ReportStatus;
  newStatus: ReportStatus;
  note: string;
  createdAtMs: number;
}

export interface WeeklySummaryResult {
  headline: string;
  executiveSummary: string;
  keyPatterns: string[];
  recommendedAttentionAreas: string[];
  dataDisclaimer: string;
  generatedAt: string;
}

export function getCategoryLabel(category: IssueCategory): string {
  return ISSUE_CATEGORIES.find((c) => c.value === category)?.label ?? 'Other Infrastructure';
}

export function getLanguageLabel(lang: SupportedLanguage): string {
  return SUPPORTED_LANGUAGES.find((l) => l.value === lang)?.label ?? 'English';
}

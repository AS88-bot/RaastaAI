import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Compass,
  Loader2,
  Mic,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatFirestoreErrorForUi } from '../lib/firebase';
import {
  compressImageForAnalysisBudget,
  compressImageForUpload,
  createCivicReport,
  SAFE_ANALYZE_REQUEST_BYTES,
  uploadIssueImage,
  validateImageFile,
} from '../lib/reportsService';

const MAX_AUDIO_SECONDS = 45;
const MAX_AUDIO_BYTES = 950 * 1024;
const MAX_ANALYZE_IMAGE_BASE64_CHARS = 3_350_000;
import {
  ISSUE_CATEGORIES,
  PRIORITY_LEVELS,
  SUPPORTED_LANGUAGES,
  type AiReportAnalysis,
  type CivicReport,
  type IssueCategory,
  type PriorityLevel,
  type SupportedLanguage,
} from '../types/civic';

interface ReportIssuePageProps {
  existingReports: CivicReport[];
  onNavigate: (path: string) => void;
}

export function ReportIssuePage({ existingReports, onNavigate }: ReportIssuePageProps) {
  const { user, profile } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');

  // Voice recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);

  // Form fields
  const [category, setCategory] = useState<IssueCategory>('pothole');
  const [language, setLanguage] = useState<SupportedLanguage>(profile?.preferredLanguage || 'en');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState(profile?.city || 'Hyderabad');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [prioritySuggestion, setPrioritySuggestion] = useState<PriorityLevel>('Medium');

  // AI & submission state
  const [aiAnalysis, setAiAnalysis] = useState<AiReportAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gettingGps, setGettingGps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setLanguage((prev) => (prev === 'en' ? profile.preferredLanguage : prev));
      setCity((prev) => (prev === 'Hyderabad' && profile.city ? profile.city : prev));
    }
  }, [profile]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_AUDIO_SECONDS) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">
          Sign in to report a civic issue
        </h1>
        <p className="text-sm text-[#4F5651]">
          Authentication protects public feeds from spam and links each report to your citizen
          dashboard.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/auth?next=/report')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] cursor-pointer"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#1A1D1B]">
          Email Verification Required
        </h1>
        <p className="text-sm text-[#4F5651]">
          Please verify your email address before submitting reports, or sign in with Google.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('/auth?next=/report')}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg cursor-pointer"
        >
          Manage Verification
        </button>
      </div>
    );
  }

  const handleImageFile = async (file: File) => {
    setError(null);
    const validationErr = validateImageFile(file);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    try {
      const processed = await compressImageForUpload(file);
      setCompressedBlob(processed.blob);
      setImageBase64(processed.base64);
      setImageMimeType(processed.mimeType);
      setImagePreview(URL.createObjectURL(processed.blob));
      setAiAnalysis(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process photograph.');
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is not supported in this browser. Please type your description below.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);
      const resolvedMime = (recorder.mimeType || preferredMime || 'audio/webm').split(';')[0].trim();
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: resolvedMime });
        if (blob.size > MAX_AUDIO_BYTES) {
          setAudioPreviewUrl(null);
          setAudioBase64(null);
          setAudioMimeType(null);
          setError(
            'Voice recording exceeds the 950 KB limit for AI analysis. Please record a shorter clip (under 45 seconds) or type your description.',
          );
          return;
        }
        setAudioPreviewUrl(URL.createObjectURL(blob));
        setAudioMimeType(resolvedMime);
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = String(reader.result || '');
          setAudioBase64(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();
    } catch {
      setError('Microphone access denied. You can still type your issue description.');
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleGetGps = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGettingGps(false);
      },
      (geoErr) => {
        setGettingGps(false);
        setError(`Could not retrieve GPS location (${geoErr.message}). You may enter coordinates manually or rely on road/landmark.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const [aiError, setAiError] = useState<string | null>(null);

  const handleAnalyzeWithGemini = async () => {
    setError(null);
    setAiError(null);
    if (!imageBase64) {
      setError('Please upload or capture a photograph of the civic issue before running AI analysis.');
      return;
    }
    setAnalyzing(true);
    try {
      const recentSummary = existingReports.slice(0, 15).map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        area: r.area,
        status: r.status,
      }));

      const payload = {
        imageBase64,
        imageMimeType,
        audioBase64: audioBase64 || undefined,
        audioMimeType: audioMimeType || undefined,
        description: description.trim(),
        area: area.trim(),
        landmark: landmark.trim(),
        city: city.trim() || 'Hyderabad',
        selectedCategory: category,
        language,
        existingReportsSummary: recentSummary,
      };

      const encoder = new TextEncoder();
      let serializedBody = JSON.stringify(payload);
      let payloadBytes = encoder.encode(serializedBody).length;

      if (payloadBytes > SAFE_ANALYZE_REQUEST_BYTES || payload.imageBase64.length > MAX_ANALYZE_IMAGE_BASE64_CHARS) {
        const nonImageBytes = encoder.encode(
          JSON.stringify({ ...payload, imageBase64: '', imageMimeType: 'image/jpeg' }),
        ).length;
        const maxImageBase64Budget = Math.min(
          MAX_ANALYZE_IMAGE_BASE64_CHARS,
          SAFE_ANALYZE_REQUEST_BYTES - nonImageBytes - 16_384,
        );

        if (maxImageBase64Budget < 32_000 || !compressedBlob) {
          throw new Error(
            'Combined photo and voice recording exceed the 4 MB AI analysis limit. Please remove or shorten your voice note.',
          );
        }

        const fitted = await compressImageForAnalysisBudget(compressedBlob, maxImageBase64Budget);
        payload.imageBase64 = fitted.base64;
        payload.imageMimeType = fitted.mimeType;
        serializedBody = JSON.stringify(payload);
        payloadBytes = encoder.encode(serializedBody).length;
      }

      if (payloadBytes > SAFE_ANALYZE_REQUEST_BYTES) {
        throw new Error(
          'Analysis request still exceeds the 4 MB serverless payload limit. Please shorten your voice note or select a smaller photograph.',
        );
      }

      const res = await fetch('/api/analyze-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializedBody,
      });

      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        throw new Error(
          `Server returned an unexpected response (HTTP ${res.status}): ${rawText.slice(0, 140)}`,
        );
      }
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Gemini analysis failed (HTTP ${res.status}).`,
        );
      }

      const analysis = data as unknown as AiReportAnalysis;
      setAiAnalysis(analysis);
      setCategory(analysis.suggestedCategory);
      setPrioritySuggestion(analysis.suggestedPriority);
      if (!title.trim() && analysis.conciseTitle) {
        setTitle(analysis.conciseTitle);
      }
      if (!description.trim() && analysis.conciseDescription) {
        setDescription(analysis.conciseDescription);
      }
      if (analysis.generatedComplaint) {
        setComplaintText(analysis.generatedComplaint);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach AI analysis service.';
      setAiError(msg);
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!compressedBlob) {
      setError('Please attach a photograph of the issue.');
      return;
    }
    if (area.trim().length < 2) {
      setError('Please specify the road, junction, or neighborhood area.');
      return;
    }
    if (title.trim().length < 4) {
      setError('Please enter a concise title (at least 4 characters).');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please provide a description (at least 10 characters).');
      return;
    }
    if (complaintText.trim().length < 10) {
      setError('Please provide or review the formal complaint text (at least 10 characters).');
      return;
    }

    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLng = lng.trim() ? Number(lng) : null;
    if (
      (parsedLat !== null && (Number.isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90)) ||
      (parsedLng !== null && (Number.isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180))
    ) {
      setError('Please provide valid GPS latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }

    setSubmitting(true);
    try {
      const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const imageUrl = await uploadIssueImage(user.uid, reportId, compressedBlob);

      await createCivicReport({
        reportId,
        creatorUid: user.uid,
        creatorDisplayName: profile?.displayName || user.displayName || 'Citizen',
        category,
        title: title.trim(),
        description: description.trim(),
        complaintText: complaintText.trim(),
        language,
        area: area.trim(),
        landmark: landmark.trim(),
        city: city.trim() || 'Hyderabad',
        lat: parsedLat,
        lng: parsedLng,
        imageUrl,
        aiAnalysis,
        prioritySuggestion,
      });

      onNavigate(`/reports/${reportId}`);
    } catch (err) {
      setError(formatFirestoreErrorForUi(err, 'Failed to submit report.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1D1B]">
          Report a Civic Issue
        </h1>
        <p className="text-sm text-[#4F5651]">
          Provide street-level details only (avoid private home unit numbers). AI analysis is
          advisory—you can inspect and edit all fields before publishing.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-sm text-[#991B1B]"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p>{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmitReport} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Media & Location */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Photo Evidence */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                01. Issue Photograph
              </h2>
              <span className="text-xs text-[#717873]">JPEG, PNG, WebP · Max 5 MB</span>
            </div>

            {imagePreview ? (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border border-[#E5E3DC] bg-[#EFECE5] max-h-72">
                  <img
                    src={imagePreview}
                    alt="Uploaded street issue preview"
                    className="w-full h-64 object-cover"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#15803D] inline-flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    <span>Compressed and ready for analysis</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setCompressedBlob(null);
                      setImageBase64(null);
                      setAiAnalysis(null);
                      setAiError(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      if (cameraInputRef.current) cameraInputRef.current.value = '';
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#991B1B] hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-[#D4D1C7] rounded-xl p-6 text-center space-y-4 bg-[#F8F7F4]/60">
                <p className="text-sm text-[#4F5651]">
                  Capture a clear photograph showing the road, footpath, garbage pile, or fixture.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#1A1D1B] bg-white border border-[#D4D1C7] rounded-lg hover:bg-[#EFECE5] min-h-[44px] cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-[#14452F]" aria-hidden="true" />
                    <span>Upload Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] min-h-[44px] cursor-pointer"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>Take Camera Photo</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImageFile(f);
                  }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImageFile(f);
                  }}
                />
              </div>
            )}

            {/* Optional Voice Note */}
            <div className="pt-4 border-t border-[#E5E3DC] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#1A1D1B]">
                  Optional Voice Note (English, Telugu, Hindi, Urdu · Max 45s)
                </span>
                {isRecording && (
                  <span className="font-mono text-xs text-[#991B1B] tabular-nums">
                    Recording 0:{String(recordingSeconds).padStart(2, '0')} / 0:{MAX_AUDIO_SECONDS}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#1A1D1B] bg-[#F3F1EC] border border-[#D4D1C7] rounded-lg hover:bg-[#E8E5DC] min-h-[40px] cursor-pointer"
                  >
                    <Mic className="w-4 h-4 text-[#14452F]" aria-hidden="true" />
                    <span>{audioPreviewUrl ? 'Re-record Voice Note' : 'Record Voice Note'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#991B1B] rounded-lg min-h-[40px] cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop Recording</span>
                  </button>
                )}

                {audioPreviewUrl && (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <audio controls src={audioPreviewUrl} className="h-9 w-full" />
                    <button
                      type="button"
                      onClick={() => {
                        setAudioPreviewUrl(null);
                        setAudioBase64(null);
                        setAudioMimeType(null);
                      }}
                      className="text-xs text-[#991B1B] hover:underline shrink-0 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. Location Details */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                02. Street Location &amp; Coordinates
              </h2>
              <button
                type="button"
                onClick={handleGetGps}
                disabled={gettingGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#14452F] bg-[#F3F1EC] border border-[#D4D1C7] rounded-lg hover:bg-[#E8E5DC] cursor-pointer"
              >
                {gettingGps ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Use Current GPS</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="rep-area" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                  Street / Neighborhood / Ward *
                </label>
                <input
                  id="rep-area"
                  type="text"
                  required
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Banjara Hills Road No. 12"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="rep-landmark"
                  className="block text-xs font-semibold text-[#1A1D1B] mb-1.5"
                >
                  Nearby Public Landmark
                </label>
                <input
                  id="rep-landmark"
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Near Metro Pillar 142"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rep-city" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                  City *
                </label>
                <input
                  id="rep-city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Hyderabad"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rep-lat" className="block text-xs font-semibold text-[#717873] mb-1.5">
                  Latitude (Optional)
                </label>
                <input
                  id="rep-lat"
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="17.4126"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rep-lng" className="block text-xs font-semibold text-[#717873] mb-1.5">
                  Longitude (Optional)
                </label>
                <input
                  id="rep-lng"
                  type="text"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="78.4398"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. Details & AI Draft */}
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
              03. Issue Details &amp; Complaint Review
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="rep-cat" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                  Category *
                </label>
                <select
                  id="rep-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IssueCategory)}
                  className="w-full px-3 py-2.5 text-sm border border-[#D4D1C7] rounded-lg"
                >
                  {ISSUE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rep-lang" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                  Complaint Language *
                </label>
                <select
                  id="rep-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                  className="w-full px-3 py-2.5 text-sm border border-[#D4D1C7] rounded-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label} ({l.nativeLabel})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="rep-prio" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                  Priority Suggestion
                </label>
                <select
                  id="rep-prio"
                  value={prioritySuggestion}
                  onChange={(e) => setPrioritySuggestion(e.target.value as PriorityLevel)}
                  className="w-full px-3 py-2.5 text-sm border border-[#D4D1C7] rounded-lg"
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
              <label htmlFor="rep-desc" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                Your Observation / Notes *
              </label>
              <textarea
                id="rep-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what is damaged, how long it has persisted, or traffic/safety context..."
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
              />
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleAnalyzeWithGemini}
                disabled={analyzing || !imageBase64}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[#14452F] bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg hover:bg-[#D1FAE5] transition-colors min-h-[44px] disabled:opacity-50 cursor-pointer"
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {analyzing
                    ? 'Analyzing photo & drafting complaint with Gemini...'
                    : 'Analyze Photo & Draft Complaint with Gemini AI'}
                </span>
              </button>
            </div>

            <div>
              <label htmlFor="rep-title" className="block text-xs font-semibold text-[#1A1D1B] mb-1.5">
                Report Headline *
              </label>
              <input
                id="rep-title"
                type="text"
                required
                minLength={4}
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Concise summary (auto-filled by AI or typed manually)"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="rep-complaint"
                className="block text-xs font-semibold text-[#1A1D1B] mb-1.5"
              >
                Civic Complaint Draft (Review &amp; Edit Before Submitting) *
              </label>
              <textarea
                id="rep-complaint"
                rows={5}
                required
                minLength={10}
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                placeholder="Run Gemini AI analysis above to generate a formal draft in your chosen language, or write your complaint directly."
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D1C7] rounded-lg focus:border-[#14452F] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#14452F] rounded-lg hover:bg-[#0F3624] transition-colors min-h-[44px] disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{submitting ? 'Uploading & Saving Report...' : 'Submit Civic Report'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: AI Advisory Inspection Panel */}
        <aside className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
          <div className="bg-white border border-[#E5E3DC] rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#14452F]">
                AI Advisory Assessment
              </p>
              <h2 className="font-display text-lg font-bold text-[#1A1D1B]">
                Multimodal Triage Output
              </h2>
              <p className="text-xs text-[#717873]">
                AI findings are advisory suggestions to help structure your submission, never
                verified municipal rulings.
              </p>
            </div>

            {aiError ? (
              <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] space-y-3">
                <p className="font-semibold">AI analysis interrupted</p>
                <p>{aiError}</p>
                <button
                  type="button"
                  onClick={handleAnalyzeWithGemini}
                  disabled={analyzing || !imageBase64}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#14452F] rounded-md hover:bg-[#0F3624] cursor-pointer"
                >
                  {analyzing ? 'Retrying...' : 'Retry AI Analysis'}
                </button>
              </div>
            ) : !aiAnalysis ? (
              <div className="p-5 rounded-lg bg-[#F8F7F4] border border-[#E5E3DC] text-xs text-[#4F5651] space-y-2">
                <p className="font-semibold text-[#1A1D1B]">Ready to inspect</p>
                <p>
                  Upload a street photo and click &ldquo;Analyze Photo &amp; Draft Complaint&rdquo;
                  to extract visible evidence, check for ambiguity or nearby duplicates, and draft a
                  complaint in your selected language.
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E3DC]">
                  <span className="text-xs text-[#717873]">Model Confidence</span>
                  <span className="font-mono text-sm font-semibold text-[#1A1D1B] tabular-nums">
                    {Math.round(aiAnalysis.confidence * 100)}%
                  </span>
                </div>

                {aiAnalysis.needsClarification && (
                  <div className="p-3.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] space-y-1">
                    <p className="font-semibold">Clarification Recommended</p>
                    <p>{aiAnalysis.clarificationQuestion}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#1A1D1B]">Visible Evidence Observed</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-[#4F5651]">
                    {aiAnalysis.visibleEvidence.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[#1A1D1B]">
                    Priority Suggestion: {aiAnalysis.suggestedPriority}
                  </p>
                  <p className="text-xs text-[#4F5651] leading-relaxed">
                    {aiAnalysis.priorityReasoning}
                  </p>
                </div>

                <div className="space-y-1 pt-2 border-t border-[#E5E3DC]">
                  <p className="text-xs font-semibold text-[#1A1D1B]">
                    Duplicate Check (Non-blocking)
                  </p>
                  <p className="text-xs text-[#4F5651] leading-relaxed">
                    {aiAnalysis.possibleDuplicateIndicators}
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}

import { useState, useRef, useEffect, ChangeEvent, FormEvent } from 'react';
import { Mic, MicOff, Image as ImageIcon, CheckCircle, AlertCircle, X, Send, MapPin } from 'lucide-react';
import LocationPicker from './LocationPicker';
import { EntryLocation } from '../types';

interface JournalEditorProps {
  recentEntries?: any[];
  onSaveEntry: (title: string, content: string, imageBase64: string | null, location?: EntryLocation | null) => Promise<any>;
  appMode?: 'cloud' | 'local';
  selectedModelName?: string;
}

export default function JournalEditor({
  onSaveEntry,
  appMode = 'cloud',
  selectedModelName = 'DistilBERT Sentiment',
}: JournalEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState<EntryLocation | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + " ";
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setContent((prev) => prev + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Mic recording toggle
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setSaveError("Speech recognition is not supported in this browser layout.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  // Image Upload handler - scales and optimizes image for safe Firestore document storage
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSaveError("Please upload a valid image file (PNG, JPG, WEBP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Limit maximum dimension to 1024px to keep size well under 1MB Firestore limit (~60-150KB)
        const maxDim = 1024;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.82);
          setImageBase64(compressed);
          setImagePreview(compressed);
        } else {
          setImageBase64(rawDataUrl);
          setImagePreview(rawDataUrl);
        }
      };
      img.onerror = () => {
        setImageBase64(rawDataUrl);
        setImagePreview(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageBase64(null);
    setImagePreview(null);
  };

  // Secure Save entry
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const defaultTitle = title.trim() || `Reflection on ${new Date().toLocaleDateString()}`;
      await onSaveEntry(defaultTitle, content, imageBase64, location);
      
      // Zero-Crash Input state clearance: ONLY clear when database write is fully confirmed!
      setTitle("");
      setContent("");
      setImageBase64(null);
      setImagePreview(null);
      setLocation(null);
      setShowLocationPicker(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error("Secure Save failed:", err);
      let userMsg = err.message || "Failed to commit entry securely to Firestore database. Please retry.";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed && parsed.error) {
          userMsg = parsed.error;
        }
      } catch (_) {
        // Not a JSON error, keep standard message
      }
      setSaveError(userMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrentDate = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('en-US', options);
  };

  return (
    <div className="space-y-6">
      {/* Date Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif italic text-2xl md:text-3.5xl font-normal text-slate-100 tracking-wide select-none">
          {formatCurrentDate()}
        </h2>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Main Editor Text Area with inner controls in a unified elegant dark box */}
        <div className="bg-[#0B0C0F] rounded-2xl border border-[#15161C] p-5 md:p-6 flex flex-col min-h-[440px] focus-within:border-zinc-700 transition-all duration-300 relative">
          {/* Optional Title input embedded borderless at top of text block */}
          <input
            type="text"
            placeholder="Give this reflection a title... (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSaving}
            className="w-full bg-transparent text-sm font-semibold text-slate-200 placeholder-[#3F424E] focus:outline-none border-b border-[#15161C] pb-3 mb-4 transition"
          />

          {/* Textarea share content */}
          <textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSaving}
            className="w-full flex-1 bg-transparent text-sm text-slate-100 placeholder-[#3F424E] focus:outline-none resize-none leading-relaxed italic placeholder:not-italic"
          />

          {/* Attachment Preview nestled neatly above the toolbar */}
          {imagePreview && (
            <div className="relative inline-flex items-center gap-3 self-start mt-2 mb-4 border border-[#1F2229] rounded-xl p-2 bg-[#121318] shrink-0 animate-fade-in">
              <img src={imagePreview} alt="Attached page" className="h-20 w-auto rounded-lg object-cover border border-[#1F2229]" />
              <div className="text-left pr-4">
                <span className="text-[10px] font-bold text-zinc-300 block uppercase tracking-wide">Image Attached</span>
                <span className="text-[9px] text-slate-400 block">Will be saved directly to your history archive</span>
              </div>
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1 shadow-md border border-zinc-600 transition"
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Location Badge */}
          {location && !showLocationPicker && (
            <div className="relative inline-flex items-center gap-2 self-start mt-2 mb-3 border border-zinc-800 rounded-xl px-3 py-1.5 bg-zinc-900/90 shrink-0 animate-fade-in text-xs">
              <MapPin className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
              <span className="text-zinc-200 font-medium truncate max-w-[280px]">{location.name}</span>
              <button
                type="button"
                onClick={() => setLocation(null)}
                className="text-zinc-500 hover:text-rose-400 transition p-0.5 cursor-pointer"
                title="Remove location"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Location Picker Inline Panel */}
          {showLocationPicker && (
            <div className="mb-4">
              <LocationPicker
                location={location}
                onChange={(loc) => {
                  setLocation(loc);
                  if (loc) setShowLocationPicker(false);
                }}
                onClose={() => setShowLocationPicker(false)}
              />
            </div>
          )}

          {/* Inline bottom bar inside the exact writing frame box */}
          <div className="flex items-center justify-between border-t border-[#15161C] pt-4 mt-auto">
            <div className="flex items-center gap-2.5">
              {/* Mic Icon Button */}
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isSaving}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 border ${
                  isRecording
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                    : 'bg-[#141418] hover:bg-[#1C1C22] border-[#202129] text-slate-400 hover:text-slate-200'
                }`}
                title={isRecording ? "Stop recording speech" : "Speak to text"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Photo Upload Icon Button */}
              <label className="w-9 h-9 rounded-full flex items-center justify-center bg-[#141418] hover:bg-[#1C1C22] border border-[#202129] text-slate-400 hover:text-slate-200 transition active:scale-90 cursor-pointer" title="Attach photo to archive">
                <ImageIcon className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={isSaving}
                  className="hidden"
                />
              </label>

              {/* Location Tag Icon Button */}
              <button
                type="button"
                onClick={() => setShowLocationPicker(prev => !prev)}
                disabled={isSaving}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 border ${
                  location || showLocationPicker
                    ? 'bg-zinc-800 text-zinc-100 border-zinc-600'
                    : 'bg-[#141418] hover:bg-[#1C1C22] border-[#202129] text-slate-400 hover:text-slate-200'
                }`}
                title={location ? `Location: ${location.name}` : "Attach GPS location"}
              >
                <MapPin className="w-4 h-4" />
              </button>
            </div>

            {/* Save Button inside the bottom-right of the writing frame */}
            <button
              type="submit"
              disabled={isSaving || (!content.trim() && !imageBase64)}
              className="inline-flex items-center gap-1.5 bg-[#18112C] hover:bg-[#20173A] text-[#9E8CF4] border border-[#342466] px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </button>
          </div>

        </div>

        {/* Success Banner */}
        {saveSuccess && (
          <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {appMode === 'local'
                ? `Reflection analyzed on-device via ${selectedModelName} and committed to private IndexedDB (Zero Cloud Outbound).`
                : "Reflection analyzed, indexed, and committed to secure Cloud vectors successfully."}
            </span>
          </div>
        )}

        {/* Persistent Error Toast */}
        {saveError && (
          <div className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-4 py-3 rounded-xl text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-rose-300">Persistence Error</p>
              <p className="text-slate-400 text-[11px]">{saveError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              className="text-slate-500 hover:text-slate-300 text-[10px] font-bold"
            >
              Dismiss
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { BookOpen, ShieldCheck, Heart, Sparkles, MessageCircle, Cpu } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';

interface LandingPageProps {
  onAuthSuccess: () => void;
}

export default function LandingPage({ onAuthSuccess }: LandingPageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onAuthSuccess();
    } catch (err: any) {
      const code = err?.code || '';
      const message = err?.message || '';
      const isCancellation = code === 'auth/popup-closed-by-user' || 
                             message.includes('popup-closed-by-user') ||
                             code === 'auth/cancelled-popup-request' ||
                             message.includes('cancelled-popup-request');
      if (isCancellation) {
        console.warn("Google Sign-In Cancelled by User:", message || err);
      } else {
        console.error("Google Sign-In Error:", err);
      }
      if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
        setError("The authentication window was closed. Please enable pop-ups and try again to sign in.");
      } else if (code === 'auth/cancelled-popup-request' || message.includes('cancelled-popup-request')) {
        setError("Sign-in was interrupted. Please try again.");
      } else {
        setError(err.message || "Failed to authenticate. Please verify popup permissions.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="landing-page" className="min-h-screen bg-[#0D0E12] text-[#E2E8F0] flex flex-col justify-between selection:bg-indigo-500/30 font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-[#1F2229] flex items-center justify-between px-6 bg-[#0F1115] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BookOpen className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="font-bold text-base tracking-tight text-white">
            Echo <span className="text-zinc-400 font-normal">Mind</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
          <span className="text-[9px] uppercase tracking-widest font-semibold text-emerald-400">Secure Tunnel Active</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-6 max-w-2xl"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-semibold text-indigo-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>AI-Guided Multimodal Sounding Board</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
            A sacred space for your thoughts, <br className="hidden sm:inline" />
            remembered with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">semantic clarity</span>.
          </h1>

          <p className="text-slate-400 text-base max-w-xl mx-auto font-sans leading-relaxed">
            A secure, user-isolated journaling experience. Log in to choose between fast Cloud Gemini inference or 100% on-device local models with local IndexedDB storage.
          </p>

          <div className="pt-4 space-y-3">
            <button
              id="google-signin-btn"
              onClick={handleSignIn}
              disabled={loading}
              className="inline-flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
              )}
              <span>Continue with Google Sign-In</span>
            </button>

            {error && (
              <p className="mt-4 text-xs font-semibold text-rose-400 bg-rose-950/30 border border-rose-900/40 px-4 py-2.5 rounded-lg max-w-sm mx-auto">
                {error}
              </p>
            )}
          </div>
        </motion.div>

        {/* Features Minimal Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-16 border-t border-[#1F2229] pt-12 text-left">
          <div className="bg-[#0F1115] border border-[#1F2229] p-5 rounded-xl space-y-3">
            <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <h3 className="font-bold text-white text-sm">Cloud or Full-Local Inference</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Default to fast encrypted Gemini cloud API, or switch to Full-Local mode with on-device models (Llama 3 8B or Gemma 2 2B) and private IndexedDB storage.
            </p>
          </div>

          <div className="bg-[#0F1115] border border-[#1F2229] p-5 rounded-xl space-y-3">
            <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
              <MessageCircle className="w-4.5 h-4.5" />
            </div>
            <h3 className="font-bold text-white text-sm">Conversational RAG Memory</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Query your previous entries using direct semantic meaning. No exact keyword tags needed. Echo Mind remembers your patterns, growth steps, and breakthroughs.
            </p>
          </div>

          <div className="bg-[#0F1115] border border-[#1F2229] p-5 rounded-xl space-y-3">
            <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
              <Heart className="w-4.5 h-4.5" />
            </div>
            <h3 className="font-bold text-white text-sm">Emotional Insights & Goals</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Every reflection automatically generates mood classifications, extracted action goals, and wellbeing trend mapping across both cloud and local modes.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-6 border-t border-[#1F2229] text-[10px] text-slate-500 font-mono bg-[#0F1115]">
        <p>&copy; 2026 Echo Mind. Securely containerized and authenticated.</p>
      </footer>
    </div>
  );
}

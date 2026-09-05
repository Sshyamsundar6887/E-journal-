  import { useState, useRef, useEffect, FormEvent } from 'react';
import { ChatMessage } from '../types';
import { Send, Sparkles, MessageCircle, AlertCircle, X } from 'lucide-react';

interface ChatLoopProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<any>;
  onClose?: () => void;
  appMode?: 'cloud' | 'local';
  selectedModelName?: string;
}

export default function ChatLoop({
  messages,
  onSendMessage,
  onClose,
  appMode = 'cloud',
  selectedModelName = 'DistilBERT Sentiment',
}: ChatLoopProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceMatches, setSourceMatches] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setError(null);
    const textToSend = query.trim();
    setQuery("");

    try {
      const responsePayload = await onSendMessage(textToSend);
      if (responsePayload && responsePayload.matches) {
        setSourceMatches(responsePayload.matches);
      } else {
        setSourceMatches([]);
      }
    } catch (err: any) {
      console.error("Chat message error:", err);
      setError(err.message || "Failed to query semantic memories.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-transparent flex flex-col h-full text-[#E2E8F0]">
      {/* Title Panel aligned to the style of the user's uploaded image */}
      <div className="shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${appMode === 'local' ? 'bg-emerald-400' : 'bg-zinc-400'} animate-pulse`}></span>
            <h3 className="font-serif italic text-sm font-normal text-slate-100 tracking-wide select-none">AI Sounding Board</h3>
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded tracking-wider uppercase ${
                appMode === 'local'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}
            >
              {appMode === 'local' ? `Local: ${selectedModelName}` : 'Cloud: Gemini'}
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#15171C] rounded border border-[#121318] text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title="Minimize chat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-[11px] italic text-[#555866] mt-1 leading-normal select-none">
          Ask questions about your past entries. <br />
          (e.g., &ldquo;When was I feeling burned out?&rdquo;)
        </p>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 scrollbar-none scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-2 opacity-60">
            <div className="w-9 h-9 rounded-full bg-[#0F1014] flex items-center justify-center border border-[#1B1C22]">
              <Sparkles className="w-4 h-4 text-[#8170D4]" />
            </div>
            <p className="text-xs font-semibold text-slate-400">Secure Semantic Memory</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs font-sans leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#18112C] border border-[#342466] text-[#E2E8F0] rounded-tr-none'
                    : 'bg-[#0B0C0F] border border-[#15161C] text-slate-200 rounded-tl-none'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-[9px] text-slate-600 mt-1 px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}

        {/* Loading Bubble */}
        {loading && (
          <div className="flex items-start">
            <div className="bg-[#0B0C0F] border border-[#15161C] rounded-xl rounded-tl-none px-4 py-3 text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#8170D4] rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-[#8170D4] rounded-full animate-bounce delay-75"></span>
              <span className="w-1.5 h-1.5 bg-[#8170D4] rounded-full animate-bounce delay-150"></span>
              <span className="text-slate-500 font-sans text-[11px] ml-1">Scanning vectors...</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 px-3.5 py-2 rounded-lg text-[11px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Citations/References section (RAG Matches) */}
      {sourceMatches.length > 0 && (
        <div className="bg-[#0B0C0F] rounded-lg p-2.5 border border-[#15161C] mb-4 shrink-0 max-h-24 overflow-y-auto">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Retrieved Memories:</span>
          <div className="flex flex-col gap-1">
            {sourceMatches.map((m, idx) => (
              <div key={idx} className="text-[10px] text-slate-400 font-sans flex items-center justify-between gap-1.5">
                <span className="truncate max-w-[180px] font-medium text-slate-300">✓ {m.title || "Untitled"}</span>
                <span className="text-slate-500 shrink-0 text-[9px]">{new Date(m.date).toLocaleDateString()} ({Math.round(m.score * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Form matching the bottom pill in the user's uploaded image */}
      <form onSubmit={handleSend} className="relative flex items-center shrink-0">
        <input
          type="text"
          placeholder="Ask your past self..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          className="w-full text-xs border border-[#1B1C22] rounded-full pl-4 pr-11 py-3 bg-[#0F1014] text-[#8E929E] placeholder-[#555866] focus:outline-none focus:border-zinc-500 transition disabled:opacity-65"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-1.5 p-2 rounded-full text-zinc-300 hover:text-white transition cursor-pointer disabled:opacity-30"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

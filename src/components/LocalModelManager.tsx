import { useState, useEffect } from 'react';
import {
  AppMode,
  LocalModelId,
  LocalModelMeta,
  LocalDatabaseStats,
} from '../types';
import {
  getAppMode,
  setAppMode,
  getSelectedLocalModel,
  setSelectedLocalModel,
  getLocalModelsState,
  startModelDownload,
  cancelModelDownload,
  deleteDownloadedModel,
} from '../lib/localInference';
import {
  getLocalDbStats,
  clearLocalDb,
  exportLocalDbAsJson,
} from '../lib/localDb';
import { auth } from '../lib/firebase';
import {
  Cpu,
  Cloud,
  HardDrive,
  Download,
  CheckCircle,
  AlertCircle,
  Trash2,
  FileJson,
  X,
  Sparkles,
  Shield,
  Layers,
} from 'lucide-react';

interface LocalModelManagerProps {
  onModeChange?: (mode: AppMode) => void;
  onModelChange?: (modelId: LocalModelId) => void;
  onMigrateToCloud?: () => void;
}

export default function LocalModelManager({
  onModeChange,
  onModelChange,
}: LocalModelManagerProps) {
  const [appMode, setLocalAppMode] = useState<AppMode>(getAppMode());
  const [selectedModel, setLocalSelectedModel] = useState<LocalModelId>(
    getSelectedLocalModel()
  );
  const [models, setModels] = useState<Record<LocalModelId, LocalModelMeta>>(
    getLocalModelsState()
  );
  const [dbStats, setDbStats] = useState<LocalDatabaseStats>({
    entryCount: 0,
    actionItemCount: 0,
    estimatedStorageBytes: 0,
    lastUpdated: Date.now(),
  });

  // Download state
  const [downloadingModelId, setDownloadingModelId] = useState<LocalModelId | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);

  // Confirmation Modal for Download
  const [modelToConfirmDownload, setModelToConfirmDownload] = useState<LocalModelMeta | null>(null);
  const [showClearDbConfirm, setShowClearDbConfirm] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Load stats
  const refreshDbStats = async () => {
    try {
      const stats = await getLocalDbStats(auth.currentUser?.uid);
      setDbStats(stats);
    } catch (err) {
      console.warn('Failed to load local DB stats:', err);
    }
  };

  useEffect(() => {
    refreshDbStats();

    const handleLocalDbUpdate = () => refreshDbStats();
    window.addEventListener('aura_local_db_updated', handleLocalDbUpdate);
    window.addEventListener('aura_models_state_updated', () => setModels(getLocalModelsState()));

    return () => {
      window.removeEventListener('aura_local_db_updated', handleLocalDbUpdate);
    };
  }, []);

  // Handle Mode Switch
  const handleSwitchMode = (newMode: AppMode) => {
    setLocalAppMode(newMode);
    setAppMode(newMode);
    if (onModeChange) onModeChange(newMode);

    setFeedbackNotice(
      newMode === 'local'
        ? 'Switched to Full-Local mode. All inference and storage are now 100% on-device.'
        : 'Switched to Cloud API. Using fast encrypted Gemini pipeline and Firestore.'
    );
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  // Handle Model Selection
  const handleSelectModel = (modelId: LocalModelId) => {
    setLocalSelectedModel(modelId);
    setSelectedLocalModel(modelId);
    if (onModelChange) onModelChange(modelId);
  };

  // Trigger Download Flow with Confirmation
  const handleRequestDownload = (model: LocalModelMeta) => {
    setModelToConfirmDownload(model);
  };

  const handleConfirmDownload = async () => {
    if (!modelToConfirmDownload) return;
    const targetModelId = modelToConfirmDownload.id;
    setModelToConfirmDownload(null);

    setDownloadingModelId(targetModelId);
    setDownloadProgress(0);

    try {
      await startModelDownload(
        targetModelId,
        (progress, downloaded, total, speed) => {
          setDownloadProgress(progress);
          setDownloadedMB(downloaded);
          setTotalMB(total);
          setDownloadSpeed(speed);
        }
      );

      setModels(getLocalModelsState());
      setFeedbackNotice(
        `${models[targetModelId].name} downloaded successfully! Ready for real on-device execution.`
      );
      setTimeout(() => setFeedbackNotice(null), 4500);
    } catch (err: any) {
      if (err?.message !== 'Download cancelled by user.') {
        setFeedbackNotice('Download failed. Please check network connection and retry.');
        setTimeout(() => setFeedbackNotice(null), 5000);
      }
    } finally {
      setDownloadingModelId(null);
    }
  };

  const handleCancelDownload = () => {
    cancelModelDownload();
    setDownloadingModelId(null);
  };

  const handleDeleteModel = async (modelId: LocalModelId) => {
    if (
      confirm(
        `Are you sure you want to delete ${models[modelId].name} from local storage? You can re-download it anytime.`
      )
    ) {
      await deleteDownloadedModel(modelId);
      setModels(getLocalModelsState());
    }
  };

  const handleExportJson = async () => {
    const jsonStr = await exportLocalDbAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EchoMind_Local_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmClearDb = async () => {
    await clearLocalDb();
    setShowClearDbConfirm(false);
    await refreshDbStats();
    setFeedbackNotice('Local IndexedDB database cleared.');
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  return (
    <div className="space-y-6 text-left">
      {/* Feedback Notice Banner */}
      {feedbackNotice && (
        <div className="p-3.5 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-zinc-200 flex items-center gap-2 animate-fade-in">
          <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {/* SECTION 1: Privacy & Inference Mode Switcher */}
      <div className="bg-[#101114] border border-[#1E2024] p-5 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-400" />
              Inference & Data Architecture
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Choose between high-speed encrypted cloud pipelines or completely isolated on-device execution.
            </p>
          </div>
          <span
            className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded uppercase tracking-wider ${
              appMode === 'cloud'
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {appMode === 'cloud' ? 'Cloud Mode' : 'Full-Local Active'}
          </span>
        </div>

        {/* 2-Option Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Card 1: Fast Encrypted Cloud API (Default) */}
          <div
            onClick={() => handleSwitchMode('cloud')}
            className={`p-4 rounded-xl border transition cursor-pointer relative flex flex-col justify-between ${
              appMode === 'cloud'
                ? 'bg-[#18191E] border-zinc-500 shadow-lg shadow-black/40'
                : 'bg-[#0E0F12] border-[#1C1E22] hover:border-zinc-700 opacity-80'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-zinc-300" />
                  <span className="text-xs font-bold text-white">Encrypted Cloud API</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded">
                  Default
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Instant onboarding with zero heavy downloads. Uses Google Gemini API with automated multi-model fallback ladder and Firestore cloud database.
              </p>
            </div>
            <div className="pt-3 border-t border-[#1C1E22] mt-3 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Zero disk storage needed</span>
              <span className="text-zinc-200 font-semibold">{appMode === 'cloud' ? '● Active' : 'Select'}</span>
            </div>
          </div>

          {/* Card 2: Full-Local Mode */}
          <div
            onClick={() => handleSwitchMode('local')}
            className={`p-4 rounded-xl border transition cursor-pointer relative flex flex-col justify-between ${
              appMode === 'local'
                ? 'bg-[#121915] border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                : 'bg-[#0E0F12] border-[#1C1E22] hover:border-zinc-700 opacity-80'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Full-Local Mode</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                  Private
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                100% on-device private execution. Inference routes through in-browser micro models (DistilBERT SST-2 or all-MiniLM-L6-v2) and journals persist in local IndexedDB.
              </p>
            </div>
            <div className="pt-3 border-t border-[#1C1E22] mt-3 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Zero cloud outbound traffic</span>
              <span className="text-emerald-400 font-semibold">{appMode === 'local' ? '● Active' : 'Select'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Local Micro Models Selection & Download Manager */}
      <div className="bg-[#101114] border border-[#1E2024] p-5 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-300" />
              In-Browser Micro Models (WebAssembly sandbox)
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Genuine ONNX neural models executed locally inside your browser's WebAssembly sandbox. Lightweight weights (~25 MB) downloaded directly to your browser cache.
            </p>
          </div>
          {appMode === 'local' && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded shrink-0">
              Active in Local Mode
            </span>
          )}
        </div>

        {/* Downloading Live Banner */}
        {downloadingModelId && (
          <div className="bg-[#16171C] border border-zinc-700 p-4 rounded-xl space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-bold text-white">
                  Streaming {models[downloadingModelId].name} into browser sandbox...
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelDownload}
                className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#08080A] rounded-full h-2 overflow-hidden border border-[#20222A]">
              <div
                className="bg-gradient-to-r from-zinc-400 to-emerald-400 h-full transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span>
                {downloadedMB} MB / {totalMB} MB ({downloadProgress}%)
              </span>
              <span>Speed: ~{downloadSpeed} MB/s</span>
            </div>
          </div>
        )}

        {/* Model 1 & Model 2 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Model 1: DistilBERT Sentiment */}
          {(() => {
            const m = models['distilbert-sentiment'];
            const isSelected = selectedModel === 'distilbert-sentiment';
            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                  isSelected
                    ? 'bg-[#16181D] border-zinc-400 shadow-md shadow-black/30'
                    : 'bg-[#0E0F12] border-[#1E2024]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{m.name}</span>
                        <span className="text-[10px] font-normal text-zinc-400">({m.parameters})</span>
                      </div>
                      <p className="text-[10px] text-zinc-300 font-mono mt-0.5">
                        Sandbox Weight: <strong className="text-white font-bold">{m.size}</strong> ({m.quantization})
                      </p>
                    </div>

                    {m.downloaded ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" />
                        READY
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-zinc-400 bg-[#16171E] border border-[#23242E] px-2 py-0.5 rounded">
                        {m.size}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">{m.description}</p>

                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Strengths:</div>
                    <ul className="text-[10px] text-zinc-300 space-y-0.5">
                      {m.strengths.map((s, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-400 shrink-0"></span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[9px] text-zinc-500 font-mono">
                    Runtime: WebAssembly • {m.ramRequired}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-[#1C1E22] mt-4 flex items-center justify-between gap-2">
                  {m.downloaded ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelectModel('distilbert-sentiment')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-100 text-black shadow-sm'
                            : 'bg-zinc-800 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {isSelected ? '● Active Model' : 'Select Model'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel('distilbert-sentiment')}
                        title="Delete cached weights"
                        className="text-zinc-500 hover:text-rose-400 p-1.5 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!!downloadingModelId}
                      onClick={() => handleRequestDownload(m)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Model ({m.size})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Model 2: all-MiniLM-L6-v2 */}
          {(() => {
            const m = models['minilm-embeddings'];
            const isSelected = selectedModel === 'minilm-embeddings';
            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                  isSelected
                    ? 'bg-[#16181D] border-zinc-400 shadow-md shadow-black/30'
                    : 'bg-[#0E0F12] border-[#1E2024]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{m.name}</span>
                        <span className="text-[10px] font-normal text-zinc-400">({m.parameters})</span>
                      </div>
                      <p className="text-[10px] text-zinc-300 font-mono mt-0.5">
                        Sandbox Weight: <strong className="text-white font-bold">{m.size}</strong> ({m.quantization})
                      </p>
                    </div>

                    {m.downloaded ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        <CheckCircle className="w-3 h-3" />
                        READY
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-zinc-400 bg-[#16171E] border border-[#23242E] px-2 py-0.5 rounded">
                        {m.size}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">{m.description}</p>

                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Strengths:</div>
                    <ul className="text-[10px] text-zinc-300 space-y-0.5">
                      {m.strengths.map((s, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-400 shrink-0"></span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-[9px] text-zinc-500 font-mono">
                    Runtime: WebAssembly • {m.ramRequired}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-[#1C1E22] mt-4 flex items-center justify-between gap-2">
                  {m.downloaded ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSelectModel('minilm-embeddings')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-100 text-black shadow-sm'
                            : 'bg-zinc-800 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {isSelected ? '● Active Model' : 'Select Model'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel('minilm-embeddings')}
                        title="Delete cached weights"
                        className="text-zinc-500 hover:text-rose-400 p-1.5 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!!downloadingModelId}
                      onClick={() => handleRequestDownload(m)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-100 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Model ({m.size})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* SECTION 3: Local Private Database (IndexedDB) Management */}
      <div className="bg-[#101114] border border-[#1E2024] p-5 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-300" />
              Local Private Database (IndexedDB)
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              In Full-Local mode, reflections and action items are saved directly into your browser's private IndexedDB sandbox.
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold bg-[#15171C] text-zinc-300 border border-[#20222A] px-2.5 py-1 rounded uppercase shrink-0">
            {dbStats.entryCount} Entries Local
          </span>
        </div>

        {/* Database Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-[#0C0D10] border border-[#17181D] p-3 rounded-xl">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Journal Records</div>
            <div className="text-base font-bold text-white mt-0.5">{dbStats.entryCount}</div>
          </div>
          <div className="bg-[#0C0D10] border border-[#17181D] p-3 rounded-xl">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Action Items</div>
            <div className="text-base font-bold text-white mt-0.5">{dbStats.actionItemCount}</div>
          </div>
          <div className="bg-[#0C0D10] border border-[#17181D] p-3 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">IndexedDB Footprint</div>
            <div className="text-base font-bold text-zinc-200 mt-0.5">
              {(dbStats.estimatedStorageBytes / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={dbStats.entryCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#15171C] hover:bg-[#1B1E24] border border-[#20222A] text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-40"
          >
            <FileJson className="w-3.5 h-3.5 text-zinc-300" />
            <span>Export Local DB (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClearDbConfirm(true)}
            disabled={dbStats.entryCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-40 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Wipe Local DB</span>
          </button>
        </div>
      </div>

      {/* Data Loss Disclaimer */}
      <div className="bg-amber-500/5 border border-amber-500/15 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">⚠ Storage & Persistence Notice</div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            All locally stored data — including journal entries, action items, and in-browser micro model weights — is saved in your browser's private sandbox (IndexedDB &amp; CacheStorage). <strong className="text-amber-200/80">Clearing your browser cache or site data will purge local data.</strong> Export JSON backups regularly to keep an offline archive.
          </p>
        </div>
      </div>

      {/* MODAL 1: Confirm Model Download with Stated Size */}
      {modelToConfirmDownload && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#0D0E12] border border-[#1E2026] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Download {modelToConfirmDownload.name}?
                  </h4>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    Micro Model Weight: {modelToConfirmDownload.size} ({modelToConfirmDownload.quantization})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModelToConfirmDownload(null)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed bg-[#121318] p-3.5 rounded-xl border border-[#1E2026]">
              <p>
                You are about to stream the ONNX micro model for{' '}
                <strong className="text-white">{modelToConfirmDownload.name}</strong> directly into your browser's WebAssembly sandbox CacheStorage.
              </p>
              <p className="text-[11px] text-zinc-400">
                Total transfer: <strong className="text-white">{modelToConfirmDownload.size}</strong>. Once cached, it runs 100% offline and locally inside the browser with zero external server calls.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModelToConfirmDownload(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDownload}
                className="px-5 py-2.5 bg-zinc-100 hover:bg-white text-black rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-black/40"
              >
                Confirm & Download ({modelToConfirmDownload.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Wipe Local Database Confirm */}
      {showClearDbConfirm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#0D0E12] border border-[#1E2026] rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Clear Local Database?</h4>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Permanent Action</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              This will permanently delete all {dbStats.entryCount} entries stored in your browser's local IndexedDB. Cloud entries will remain unaffected.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearDbConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearDb}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
              >
                Clear Local Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

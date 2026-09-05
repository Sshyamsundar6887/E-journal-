import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { JournalEntry, ChatMessage, MoodTrendPoint, ActionItem, AppMode, LocalModelId, EntryLocation } from '../types';
import { collection, onSnapshot, query, orderBy, setDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { LogOut, User, Sparkles, BookOpen, Calendar, ChevronRight, Activity, Eye, Trash2, MessageCircle, Settings, X, Image as ImageIcon, ZoomIn, Download, FileText, Table, Copy, Check, Database, Cloud, Cpu, Shield, HardDrive, MapPin } from 'lucide-react';
import JournalEditor from './JournalEditor';
import MoodChart from './MoodChart';
import ActionItems from './ActionItems';
import ChatLoop from './ChatLoop';
import StreakCalendar from './StreakCalendar';
import LocalModelManager from './LocalModelManager';
import { exportEntriesToCsv, exportEntriesToPdf } from '../utils/exportUtils';
import {
  getCachedAccessToken,
  clearCachedAccessToken,
  googleWorkspaceSignIn,
  createCalendarEvent,
  createGoogleTask
} from '../lib/workspaceAuth';
import {
  getAppMode,
  setAppMode,
  getSelectedLocalModel,
  setSelectedLocalModel,
  isModelDownloaded,
  analyzeEntryLocally,
  chatWithLocalModel,
  generatePromptLocally,
  LOCAL_MODELS,
} from '../lib/localInference';
import {
  getLocalEntries,
  saveLocalEntry,
  deleteLocalEntry,
  updateLocalActionItem,
  addManualLocalActionItem,
  deleteLocalActionItem,
} from '../lib/localDb';

export default function Dashboard() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'chamber' | 'insights' | 'history' | 'settings'>('chamber');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // App Privacy & Inference Architecture Mode
  const [appMode, setAppModeState] = useState<AppMode>(getAppMode());
  const [selectedLocalModel, setSelectedLocalModelState] = useState<LocalModelId>(
    getSelectedLocalModel()
  );
  const [localDownloadModalOpen, setLocalDownloadModalOpen] = useState(false);

  // Sync Settings
  const [syncSettings, setSyncSettings] = useState({
    calendarEnabled: false,
    tasksEnabled: false,
    promptOnSave: false
  });
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [syncDialogTasks, setSyncDialogTasks] = useState<Array<{
    id: string;
    text: string;
    syncCalendar: boolean;
    syncTasks: boolean;
    calendarTime: string;
    tasksDueDate: string;
  }>>([]);
  const [isSyncingInProgress, setIsSyncingInProgress] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<{ title: string; message: string; type?: 'info' | 'error' | 'success' } | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const showNotice = (title: string, message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNoticeMessage({ title, message, type });
  };

  // Settings tab AI Prompt Generator state
  const [settingsPrompt, setSettingsPrompt] = useState<{ prompt: string; contextReason?: string } | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const currentUser = auth.currentUser;

  // Prevent a Workspace token from surviving logout or a Firebase user switch.
  useEffect(() => {
    clearCachedAccessToken();
  }, [currentUser?.uid]);

  // Real-time listener for Journal Entries (Firestore for Cloud Mode, IndexedDB for Local Mode)
  useEffect(() => {
    if (appMode === 'local') {
      const loadLocalData = async () => {
        try {
          const localItems = await getLocalEntries(currentUser?.uid);
          setEntries(localItems);
          setLoading(false);
        } catch (err) {
          console.error("Local DB load failed:", err);
          setLoading(false);
        }
      };
      loadLocalData();

      const handleLocalUpdated = async () => {
        const localItems = await getLocalEntries(currentUser?.uid);
        setEntries(localItems);
      };
      window.addEventListener('aura_local_db_updated', handleLocalUpdated);
      return () => window.removeEventListener('aura_local_db_updated', handleLocalUpdated);
    }

    if (!currentUser) return;

    const entriesRef = collection(db, "users", currentUser.uid, "entries");
    const q = query(entriesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEntries: JournalEntry[] = [];
      snapshot.forEach((doc) => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as JournalEntry);
      });
      setEntries(fetchedEntries);
      setLoading(false);
    }, (error) => {
      console.error("Firestore real-time sync failed:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/entries`);
    });

    return () => unsubscribe();
  }, [currentUser, appMode]);

  // Real-time listener for Google Workspace Sync settings
  useEffect(() => {
    if (!currentUser) return;

    const syncDocRef = doc(db, "users", currentUser.uid, "settings", "sync");
    const unsubscribe = onSnapshot(syncDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSyncSettings({
          calendarEnabled: !!data.calendarEnabled,
          tasksEnabled: !!data.tasksEnabled,
          promptOnSave: !!data.promptOnSave
        });
      }
    }, (error) => {
      console.error("Firestore sync settings listener failed:", error);
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/settings/sync`);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Auto-dismiss auth error toast after 10 seconds
  useEffect(() => {
    if (!authError) return;
    const timer = setTimeout(() => {
      setAuthError(null);
    }, 10000);
    return () => clearTimeout(timer);
  }, [authError]);

  // Auto-dismiss general UI notice toast after 6 seconds
  useEffect(() => {
    if (!noticeMessage) return;
    const timer = setTimeout(() => {
      setNoticeMessage(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [noticeMessage]);

  // Date helpers
  const getTomorrowDateTimeString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9:00 AM
    
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getTomorrowDateString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Google OAuth helpers
  const getFriendlyErrorMessage = (err: any): string => {
    const code = err?.code || '';
    const message = err?.message || '';
    if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
      return 'The authentication window was closed before completion. If a pop-up blocker is active, please enable pop-ups and try again.';
    }
    if (code === 'auth/cancelled-popup-request' || message.includes('cancelled-popup-request')) {
      return 'Multiple sign-in windows were triggered. Please complete the open window or try again.';
    }
    return 'Authentication could not be completed. Please confirm browser pop-ups are allowed and try again.';
  };

  const handleGoogleConnect = async () => {
    try {
      setAuthError(null);
      await googleWorkspaceSignIn();
    } catch (err: any) {
      const msg = err?.message || '';
      const isCancellation = err?.code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user');
      if (isCancellation) {
        console.warn("Google connection cancelled by user:", err);
      } else {
        console.error(err);
      }
      setAuthError(getFriendlyErrorMessage(err));
    }
  };

  const handleGoogleConnectInModal = async () => {
    try {
      setAuthError(null);
      await googleWorkspaceSignIn();
    } catch (err: any) {
      const msg = err?.message || '';
      const isCancellation = err?.code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user');
      if (isCancellation) {
        console.warn("Google connection in modal cancelled by user:", err);
      } else {
        console.error(err);
      }
      setAuthError(getFriendlyErrorMessage(err));
    }
  };

  const handleToggleSync = async (type: 'calendar' | 'tasks' | 'promptOnSave') => {
    if (!currentUser) return;

    if (type === 'promptOnSave') {
      const nextVal = !syncSettings.promptOnSave;
      setSyncSettings(prev => ({ ...prev, promptOnSave: nextVal }));
      const syncDocRef = doc(db, "users", currentUser.uid, "settings", "sync");
      await setDoc(syncDocRef, { promptOnSave: nextVal }, { merge: true });
      return;
    }

    const isEnabling = type === 'calendar' ? !syncSettings.calendarEnabled : !syncSettings.tasksEnabled;

    if (isEnabling && !getCachedAccessToken()) {
      try {
        setAuthError(null);
        const authResult = await googleWorkspaceSignIn();
        if (!authResult) return;
      } catch (err: any) {
        const msg = err?.message || '';
        const isCancellation = err?.code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user');
        if (isCancellation) {
          console.warn("Workspace sign in cancelled by user:", err);
        } else {
          console.error("Workspace sign in error:", err);
        }
        setAuthError(getFriendlyErrorMessage(err));
        return;
      }
    }

    const syncDocRef = doc(db, "users", currentUser.uid, "settings", "sync");
    try {
      await setDoc(syncDocRef, {
        calendarEnabled: type === 'calendar' ? isEnabling : syncSettings.calendarEnabled,
        tasksEnabled: type === 'tasks' ? isEnabling : syncSettings.tasksEnabled
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/settings/sync`);
    }
  };

  const handleDisablePromptOnSave = async () => {
    setSyncSettings(prev => ({ ...prev, promptOnSave: false }));
    if (currentUser) {
      const syncDocRef = doc(db, "users", currentUser.uid, "settings", "sync");
      try {
        await setDoc(syncDocRef, { promptOnSave: false }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/settings/sync`);
      }
    }
  };

  const handleToggleTaskSyncOption = (id: string, type: 'calendar' | 'tasks') => {
    setSyncDialogTasks(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          syncCalendar: type === 'calendar' ? !t.syncCalendar : t.syncCalendar,
          syncTasks: type === 'tasks' ? !t.syncTasks : t.syncTasks
        };
      }
      return t;
    }));
  };

  const handleUpdateTaskSyncTime = (id: string, type: 'calendar' | 'tasks', value: string) => {
    setSyncDialogTasks(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          calendarTime: type === 'calendar' ? value : t.calendarTime,
          tasksDueDate: type === 'tasks' ? value : t.tasksDueDate
        };
      }
      return t;
    }));
  };

  const handlePushToWorkspace = async () => {
    const token = getCachedAccessToken();
    if (!token) {
      setSyncFeedback({ type: 'error', message: 'Offline Google Workspace session. Please reconnect.' });
      return;
    }

    setIsSyncingInProgress(true);
    setSyncFeedback(null);

    let successCount = 0;
    let failCount = 0;

    for (const task of syncDialogTasks) {
      if (!task.syncCalendar && !task.syncTasks) continue;

      try {
        if (task.syncCalendar) {
          const start = new Date(task.calendarTime);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          
          await createCalendarEvent(token, {
            summary: task.text,
            description: "Generated from your Echo Mind secure reflection.",
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString()
          });
        }

        if (task.syncTasks) {
          await createGoogleTask(token, {
            title: task.text,
            notes: "Created from Echo Mind",
            dueDateTime: task.tasksDueDate
          });
        }
        successCount++;
      } catch (err) {
        console.error("Failed to sync individual task:", task, err);
        failCount++;
      }
    }

    setIsSyncingInProgress(false);
    if (failCount === 0 && successCount > 0) {
      setSyncFeedback({ type: 'success', message: `Successfully synced ${successCount} item(s) to Google Workspace!` });
      setTimeout(() => {
        setIsSyncDialogOpen(false);
        setSyncFeedback(null);
      }, 2000);
    } else if (successCount > 0) {
      setSyncFeedback({ type: 'success', message: `Synced ${successCount} item(s), but ${failCount} failed.` });
      setTimeout(() => {
        setIsSyncDialogOpen(false);
        setSyncFeedback(null);
      }, 3000);
    } else {
      setSyncFeedback({ type: 'error', message: 'Failed to push items. Ensure your Google account has necessary permissions.' });
    }
  };

  // Handle Google Log Out
  const handleSignOut = async () => {
    clearCachedAccessToken();
    await auth.signOut();
  };

  // Secure Save Journal Entry
  const handleSaveEntry = async (
    title: string,
    content: string,
    imageBase64: string | null,
    location?: EntryLocation | null
  ) => {
    // 1. FULL-LOCAL MODE: Execute on-device model and save to local IndexedDB
    if (appMode === 'local') {
      if (!isModelDownloaded(selectedLocalModel)) {
        setLocalDownloadModalOpen(true);
        throw new Error(
          `Local model ${LOCAL_MODELS[selectedLocalModel].name} (${LOCAL_MODELS[selectedLocalModel].size}) has not been downloaded yet. Please download the weights in Settings to enable offline inference.`
        );
      }

      // Execute on-device local inference
      const analysis = await analyzeEntryLocally(content, selectedLocalModel);
      const entryId = `local_entry_${Date.now()}`;

      // Map auto-generated action items
      const actionItemsWithIds: ActionItem[] = (analysis.actionItems || []).map((item: any, index: number) => ({
        id: `act_${Date.now()}_${index}`,
        text: item.text,
        completed: false
      }));

      const newEntry: JournalEntry = {
        id: entryId,
        userId: currentUser?.uid || "local_user",
        title,
        content,
        date: new Date().toISOString(),
        mood: analysis.mood || "Neutral",
        sentiment: analysis.sentiment || "neutral",
        sentimentScore: typeof analysis.sentimentScore === "number" ? analysis.sentimentScore : 0.0,
        themes: analysis.themes || [],
        summary: analysis.summary || "",
        actionItems: actionItemsWithIds,
        imageUrl: imageBase64 || undefined,
        location: location || undefined,
        embedding: analysis.embedding || [],
        createdAt: Date.now()
      };

      // Strip undefined values before saving to local IndexedDB
      const cleanPayload = JSON.parse(JSON.stringify(newEntry));
      await saveLocalEntry(cleanPayload);
      const updated = await getLocalEntries(currentUser?.uid);
      setEntries(updated);

      // Workspace Sync Trigger: Only if user explicitly opted in to promptOnSave in preferences
      if (syncSettings.promptOnSave && (syncSettings.calendarEnabled || syncSettings.tasksEnabled) && actionItemsWithIds.length > 0) {
        setSyncDialogTasks(actionItemsWithIds.map(item => ({
          id: item.id,
          text: item.text,
          syncCalendar: syncSettings.calendarEnabled,
          syncTasks: syncSettings.tasksEnabled,
          calendarTime: getTomorrowDateTimeString(),
          tasksDueDate: getTomorrowDateString()
        })));
        setIsSyncDialogOpen(true);
      }
      return;
    }

    // 2. CLOUD MODE (DEFAULT): Route through fast encrypted Gemini API and Firestore
    if (!currentUser) throw new Error("Authentication session expired.");

    const token = await currentUser.getIdToken();
    localStorage.setItem("aura_user_token", token);

    // Call API Route to generate structured analysis on text (zero image AI processing)
    const res = await fetch("/api/analyze-entry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ text: content })
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const responseText = await res.text().catch(() => "");
      console.error("Server returned non-JSON response:", responseText);
      throw new Error(`Server returned an invalid HTML/Text response (${res.status}). Please verify that your backend API is online and fully configured.`);
    }

    let analysis: any;
    try {
      analysis = await res.json();
    } catch (parseErr) {
      console.error("Failed to parse JSON response:", parseErr);
      throw new Error("Server returned an invalid response structure. Please try saving again.");
    }

    if (!res.ok) {
      throw new Error(analysis.error || "Failed to analyze and parse reflection entry.");
    }

    const entryId = `entry_${Date.now()}`;
    const entryDocRef = doc(db, "users", currentUser.uid, "entries", entryId);

    // Map auto-generated properties with generated IDs for action items
    const actionItemsWithIds: ActionItem[] = (analysis.actionItems || []).map((item: any, index: number) => ({
      id: `act_${Date.now()}_${index}`,
      text: item.text,
      completed: false
    }));

    const newEntry: JournalEntry = {
      id: entryId,
      userId: currentUser.uid,
      title,
      content,
      date: new Date().toISOString(),
      mood: analysis.mood || "Neutral",
      sentiment: analysis.sentiment || "neutral",
      sentimentScore: typeof analysis.sentimentScore === "number" ? analysis.sentimentScore : 0.0,
      themes: analysis.themes || [],
      summary: analysis.summary || "",
      actionItems: actionItemsWithIds,
      imageUrl: imageBase64 || undefined,
      location: location || undefined,
      embedding: analysis.embedding || [],
      createdAt: Date.now()
    };

    // Strip undefined values before saving (Zero-Crash Payload Hygiene)
    const cleanPayload = JSON.parse(JSON.stringify(newEntry));

    // Save to Firestore
    try {
      await setDoc(entryDocRef, cleanPayload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${currentUser.uid}/entries/${entryId}`);
    }

    // Workspace Sync Trigger: Only if user explicitly opted in to promptOnSave in preferences
    if (syncSettings.promptOnSave && (syncSettings.calendarEnabled || syncSettings.tasksEnabled) && actionItemsWithIds.length > 0) {
      setSyncDialogTasks(actionItemsWithIds.map(item => ({
        id: item.id,
        text: item.text,
        syncCalendar: syncSettings.calendarEnabled,
        syncTasks: syncSettings.tasksEnabled,
        calendarTime: getTomorrowDateTimeString(),
        tasksDueDate: getTomorrowDateString()
      })));
      setIsSyncDialogOpen(true);
    }
  };

  // Chat conversational loop
  const handleSendMessage = async (queryText: string) => {
    // 1. FULL-LOCAL MODE: Route inference through local model and local memory vectors
    if (appMode === 'local') {
      if (!isModelDownloaded(selectedLocalModel)) {
        setLocalDownloadModalOpen(true);
        throw new Error(
          `Local model ${LOCAL_MODELS[selectedLocalModel].name} (${LOCAL_MODELS[selectedLocalModel].size}) must be downloaded before running local chat.`
        );
      }

      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: queryText,
        createdAt: Date.now()
      };
      setMessages(prev => [...prev, userMessage]);

      const localRes = await chatWithLocalModel(queryText, messages, entries, selectedLocalModel);
      const modelMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: "model",
        content: localRes.response,
        createdAt: Date.now()
      };
      setMessages(prev => [...prev, modelMessage]);

      return {
        response: localRes.response,
        sources: localRes.sources,
        mode: 'local',
        model: LOCAL_MODELS[selectedLocalModel].name
      };
    }

    // 2. CLOUD MODE (DEFAULT): Route through Gemini RAG endpoint
    if (!currentUser) throw new Error("Session expired.");

    const token = await currentUser.getIdToken();

    // Append user message immediately to state
    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: queryText,
      createdAt: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);

    // Send payload to backend
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        query: queryText,
        history: messages,
        allEntries: entries
      })
    });

    if (!res.ok) throw new Error("Failed to contact memory network.");

    const payload = await res.json();

    const modelMessage: ChatMessage = {
      id: `msg_model_${Date.now()}`,
      role: 'model',
      content: payload.response,
      createdAt: Date.now()
    };

    setMessages((prev) => [...prev, modelMessage]);

    return payload; // Return so the chat loop knows matching source references
  };

  // Toggle state on aggregated Action Items
  const handleToggleActionItem = async (itemId: string) => {
    if (appMode === 'local') {
      const target = allActionItems.find(i => i.id === itemId);
      if (target) {
        await updateLocalActionItem(itemId, !target.completed);
        const updated = await getLocalEntries(currentUser?.uid);
        setEntries(updated);
      }
      return;
    }

    if (!currentUser) return;

    // Find the entry that has this action item
    const targetEntry = entries.find(e => e.actionItems && e.actionItems.some(i => i.id === itemId));
    if (!targetEntry) return;

    const updatedActions = targetEntry.actionItems.map(i => {
      if (i.id === itemId) {
        return { ...i, completed: !i.completed };
      }
      return i;
    });

    const docRef = doc(db, "users", currentUser.uid, "entries", targetEntry.id);
    try {
      await updateDoc(docRef, { actionItems: updatedActions });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/entries/${targetEntry.id}`);
    }
  };

  // Add manual Action Item to the latest entry, or create a virtual bucket
  const handleAddManualActionItem = async (text: string) => {
    if (appMode === 'local') {
      if (entries.length > 0) {
        await addManualLocalActionItem(text);
        const updated = await getLocalEntries(currentUser?.uid);
        setEntries(updated);
      } else {
        showNotice("Reflection Required", "Please record at least one journal reflection before manually appending action goals.", "info");
      }
      return;
    }

    if (!currentUser) return;

    // If we have an entry, add it to the most recent entry
    if (entries.length > 0) {
      const latest = entries[0];
      const newItem: ActionItem = {
        id: `act_manual_${Date.now()}`,
        text,
        completed: false
      };
      const updated = [...(latest.actionItems || []), newItem];
      const docRef = doc(db, "users", currentUser.uid, "entries", latest.id);
      try {
        await updateDoc(docRef, { actionItems: updated });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/entries/${latest.id}`);
      }

      // Workspace Sync Trigger for manual items
      if (syncSettings.calendarEnabled || syncSettings.tasksEnabled) {
        setSyncDialogTasks([{
          id: newItem.id,
          text: newItem.text,
          syncCalendar: syncSettings.calendarEnabled,
          syncTasks: syncSettings.tasksEnabled,
          calendarTime: getTomorrowDateTimeString(),
          tasksDueDate: getTomorrowDateString()
        }]);
        setIsSyncDialogOpen(true);
      }
    } else {
      showNotice("Reflection Required", "Please record at least one journal reflection before manually appending action goals.", "info");
    }
  };

  // Generate Prompt on-demand from Settings Tab
  const handleGeneratePromptFromSettings = async () => {
    setIsGeneratingPrompt(true);
    setSettingsPrompt(null);
    setPromptCopied(false);

    if (appMode === 'local') {
      try {
        const localPrompt = await generatePromptLocally(entries, selectedLocalModel);
        setSettingsPrompt({
          prompt: localPrompt.prompt,
          contextReason: localPrompt.contextReason
        });
      } catch (err: any) {
        console.error("Failed to generate local prompt:", err);
        showNotice("Prompt Generation Error", "Failed to generate prompt via local model.", "error");
      } finally {
        setIsGeneratingPrompt(false);
      }
      return;
    }

    try {
      const token = localStorage.getItem("aura_user_token");
      const cleanRecent = entries.slice(0, 5).map(e => ({
        content: e.content,
        mood: e.mood,
        date: e.date
      }));

      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ recentEntries: cleanRecent })
      });

      if (!res.ok) throw new Error("Failed to generate dynamic prompt");
      const data = await res.json();
      setSettingsPrompt({
        prompt: data.prompt,
        contextReason: data.contextReason
      });
    } catch (err: any) {
      console.error("Failed to generate prompt:", err);
      showNotice("Prompt Generation Error", "Failed to generate prompt. Please try again in a moment.", "error");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // Delete Action Item
  const handleDeleteActionItem = async (itemId: string) => {
    if (appMode === 'local') {
      await deleteLocalActionItem(itemId);
      const updated = await getLocalEntries(currentUser?.uid);
      setEntries(updated);
      return;
    }

    if (!currentUser) return;

    const targetEntry = entries.find(e => e.actionItems && e.actionItems.some(i => i.id === itemId));
    if (!targetEntry) return;

    const filtered = targetEntry.actionItems.filter(i => i.id !== itemId);
    const docRef = doc(db, "users", currentUser.uid, "entries", targetEntry.id);
    try {
      await updateDoc(docRef, { actionItems: filtered });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/entries/${targetEntry.id}`);
    }
  };

  // Delete Entry Trigger
  const handleDeleteEntry = (entryId: string) => {
    setEntryToDelete(entryId);
  };

  // Safe and secure deletion execution
  const confirmDeleteEntry = async () => {
    if (appMode === 'local') {
      if (!entryToDelete) return;
      await deleteLocalEntry(entryToDelete);
      const updated = await getLocalEntries(currentUser?.uid);
      setEntries(updated);
      if (activeEntry?.id === entryToDelete) {
        setActiveEntry(null);
      }
      setEntryToDelete(null);
      return;
    }

    if (!currentUser || !entryToDelete) return;

    try {
      const docRef = doc(db, "users", currentUser.uid, "entries", entryToDelete);
      await deleteDoc(docRef);
      if (activeEntry?.id === entryToDelete) {
        setActiveEntry(null);
      }
    } catch (err) {
      console.error(err);
      setAuthError("Failed to safely delete the selected archive log. Please try again.");
      handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/entries/${entryToDelete}`);
    } finally {
      setEntryToDelete(null);
    }
  };

  // Aggregations
  const trendPoints: MoodTrendPoint[] = entries.map(e => ({
    date: e.date,
    score: e.sentimentScore,
    mood: e.mood
  }));

  const allActionItems: ActionItem[] = entries.reduce((acc: ActionItem[], entry) => {
    if (entry.actionItems) {
      return [...acc, ...entry.actionItems];
    }
    return acc;
  }, []);

  // Compute theme counts
  const themeCounts: { [theme: string]: number } = {};
  entries.forEach((e) => {
    if (e.themes) {
      e.themes.forEach((t) => {
        themeCounts[t] = (themeCounts[t] || 0) + 1;
      });
    }
  });
  const themeCloud = Object.entries(themeCounts)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-[#08080A] text-[#E2E8F0] flex flex-col md:flex-row font-sans selection:bg-zinc-800 overflow-hidden">
      
      {/* MOBILE HEADER: Visible only on small devices */}
      <header className="md:hidden flex items-center justify-between bg-[#050505] border-b border-[#121318] px-5 py-4 shrink-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-md shrink-0">
            <BookOpen className="w-4 h-4 text-white stroke-[2.2]" />
          </div>
          <h1 className="text-lg font-bold tracking-tight flex items-baseline gap-1 leading-none select-none">
            <span className="text-white font-bold">Echo</span>
            <span className="font-medium text-slate-400">Mind</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab(activeTab === 'settings' ? 'chamber' : 'settings')}
            className="px-2 py-1 bg-[#15171C] border border-[#121318] rounded-lg text-[10px] font-bold text-zinc-300 cursor-pointer"
          >
            {activeTab === 'settings' ? 'WRITE' : 'SETTINGS'}
          </button>
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="p-1.5 rounded border border-[#121318] text-zinc-300"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded border border-[#121318] text-slate-400 hover:text-rose-400"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* COLUMN 1: LEFT SIDEBAR (Desktop only) */}
      <aside className="w-64 bg-[#050505] border-r border-[#121318] hidden md:flex flex-col justify-between p-6 shrink-0 h-screen select-none">
        <div>
          {/* Logo Brand matching Echo Mind reference image */}
          <div className="mb-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-lg shadow-black/40 shrink-0">
              <BookOpen className="w-5 h-5 text-white stroke-[2.2]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight flex items-baseline gap-1.5 leading-none select-none">
              <span className="text-white font-bold">Echo</span>
              <span className="font-medium text-slate-400">Mind</span>
            </h1>
          </div>

          {/* Section heading: JOURNAL */}
          <div className="space-y-6">
            <div>
              <div className="text-[9px] font-bold text-slate-500 font-sans uppercase tracking-widest mb-4">
                JOURNAL
              </div>
              <nav className="space-y-3">
                <button
                  onClick={() => setActiveTab('chamber')}
                  className={`flex items-center gap-2.5 w-full text-left text-xs font-semibold py-2 transition cursor-pointer ${
                    activeTab === 'chamber' || activeTab === 'insights'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTab === 'chamber' || activeTab === 'insights' ? 'bg-zinc-200' : 'bg-transparent border border-slate-700'}`} />
                  <span>Daily Log</span>
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2.5 w-full text-left text-xs font-semibold py-2 transition cursor-pointer ${
                    activeTab === 'history'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTab === 'history' ? 'bg-zinc-200' : 'bg-transparent border border-slate-700'}`} />
                  <span>Reflections</span>
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`flex items-center gap-2.5 w-full text-left text-xs font-semibold py-2 transition cursor-pointer ${
                    activeTab === 'settings'
                      ? 'text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTab === 'settings' ? 'bg-zinc-200' : 'bg-transparent border border-slate-700'}`} />
                  <span>Sync Settings</span>
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* User profile with security stamp at the very bottom */}
        <div className="border-t border-[#121318] pt-4 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <div className="text-xs font-bold text-slate-300 truncate font-sans">
              {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'secure_user'}
            </div>
            <div className="text-[9px] text-zinc-400 font-sans font-semibold tracking-wider mt-0.5">
              Auth: Google Secure
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-slate-500 hover:text-slate-200 p-1.5 rounded-lg hover:bg-[#15171C] transition cursor-pointer shrink-0"
            title="Log out of secure session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* COLUMN 2: CENTER MAIN CONTENT WORKSPACE PANEL */}
      <main className="flex-1 h-screen overflow-y-auto bg-[#08080A] px-6 md:px-10 py-6 flex flex-col scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        
        {/* Top Tab navigation & Status badge */}
        <div className="flex items-center justify-between border-b border-[#121318] pb-3 mb-8 shrink-0 select-none">
          <div className="flex gap-6 text-[11px] uppercase tracking-wider font-bold">
            {activeTab === 'settings' ? (
              <span className="text-slate-200">Settings & Sync</span>
            ) : activeTab === 'history' ? (
              <span className="text-slate-200">Past Reflections</span>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('chamber')}
                  className={`pb-1 transition relative cursor-pointer ${
                    activeTab === 'chamber' ? 'text-slate-200 font-bold' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Active Entry
                  {activeTab === 'chamber' && (
                    <span className="absolute -bottom-3.5 left-0 right-0 h-0.5 bg-zinc-200 rounded-full" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('insights')}
                  className={`pb-1 transition relative cursor-pointer ${
                    activeTab === 'insights' ? 'text-slate-200 font-bold' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Past Insights
                  {activeTab === 'insights' && (
                    <span className="absolute -bottom-3.5 left-0 right-0 h-0.5 bg-zinc-200 rounded-full" />
                  )}
                </button>
              </>
            )}
          </div>

          {/* Mode Pill Badge in Top Bar */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold font-mono transition cursor-pointer ${
              appMode === 'cloud'
                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
            title="Configure Cloud vs Local Mode and model downloads"
          >
            {appMode === 'cloud' ? (
              <>
                <Cloud className="w-3 h-3 text-zinc-300" />
                <span>Cloud API • Gemini</span>
              </>
            ) : (
              <>
                <Cpu className="w-3 h-3 text-emerald-400" />
                <span>Full-Local • {LOCAL_MODELS[selectedLocalModel].name}</span>
              </>
            )}
          </button>
        </div>

        {/* Render Tab Contents */}
        <div className="flex-1 pb-10">
          
          {/* TAB 1: Secure Reflection Chamber (JournalEditor) */}
          {activeTab === 'chamber' && (
            <div className="animate-fade-in">
              <JournalEditor
                recentEntries={entries}
                onSaveEntry={handleSaveEntry}
                appMode={appMode}
                selectedModelName={LOCAL_MODELS[selectedLocalModel].name}
              />
            </div>
          )}

          {/* TAB 2: Insights dashboard */}
          {activeTab === 'insights' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <MoodChart data={trendPoints} />
                <ActionItems
                  items={allActionItems}
                  onToggleItem={handleToggleActionItem}
                  onAddItem={handleAddManualActionItem}
                  onDeleteItem={handleDeleteActionItem}
                  onOpenSync={() => {
                    if (allActionItems.length > 0) {
                      setSyncDialogTasks(allActionItems.map(item => ({
                        id: item.id,
                        text: item.text,
                        syncCalendar: syncSettings.calendarEnabled,
                        syncTasks: syncSettings.tasksEnabled,
                        calendarTime: getTomorrowDateTimeString(),
                        tasksDueDate: getTomorrowDateString()
                      })));
                      setIsSyncDialogOpen(true);
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Highlighted Themes Cloud */}
                <div className="bg-[#0F1115] p-5 rounded-xl border border-[#1F2229] space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Dominant Mental Themes</h4>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {themeCloud.length === 0 ? (
                      <span className="text-xs text-slate-500 italic">No themes mapped yet. Keep journaling!</span>
                    ) : (
                      themeCloud.map((tc, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200"
                        >
                          <Sparkles className="w-3 h-3 text-zinc-400 animate-pulse" />
                          <span>{tc.theme}</span>
                          <span className="text-[10px] font-mono font-bold bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-300">
                            {tc.count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Weekly Auto-Summarizations Synthesis */}
                <div className="bg-[#0F1115] p-5 rounded-xl border border-[#1F2229] space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Weekly Reflection Synthesis</h4>
                  {entries.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Write an entry to extract weekly summaries and patterns.</p>
                  ) : (
                    <div className="space-y-3.5">
                      <p className="text-xs text-slate-300 leading-relaxed italic bg-[#15171C] p-3 rounded-lg border border-[#1F2229]">
                        &ldquo;{entries[0].summary || 'Synthesis report pending for recent log...'}&rdquo;
                      </p>
                      <span className="text-[9px] font-mono text-slate-500 block text-right">
                        Last updated {new Date(entries[0].date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Reflections Calendar Archives list */}
          {activeTab === 'history' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in">
              <div className="xl:col-span-7">
                <StreakCalendar
                  entries={entries}
                  onSelectEntry={(entry) => {
                    setActiveEntry(entry);
                  }}
                />
              </div>

              <div className="xl:col-span-5 bg-[#0F1115] p-5 rounded-xl border border-[#1F2229] space-y-4">
                <div className="flex items-center justify-between border-b border-[#1F2229] pb-2.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 font-sans">Historical Archives</h3>
                    <span className="text-[10px] bg-slate-800/40 text-slate-400 px-2.5 py-0.5 rounded font-mono font-bold border border-[#1F2229]">
                      {entries.length} logs
                    </span>
                  </div>

                  {entries.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => exportEntriesToPdf(entries)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 px-2 py-1 rounded-md transition active:scale-95 cursor-pointer"
                        title="Export all journal entries to PDF backup"
                      >
                        <FileText className="w-3 h-3 text-zinc-300" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportEntriesToCsv(entries)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 px-2 py-1 rounded-md transition active:scale-95 cursor-pointer"
                        title="Export all journal entries to CSV backup"
                      >
                        <Table className="w-3 h-3 text-emerald-400" />
                        <span>CSV</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                  {loading ? (
                    <div className="text-center py-6 text-xs text-slate-500">Loading archives...</div>
                  ) : entries.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500 italic">Your archive chest is empty. Write your first log!</div>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`p-3.5 rounded-xl border text-left space-y-2.5 transition ${
                          activeEntry?.id === entry.id
                            ? 'border-zinc-500 bg-[#15171C] shadow-none'
                            : 'border-[#1F2229] hover:border-slate-700 bg-[#0F1115]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] text-slate-500 font-medium flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                                {new Date(entry.date).toLocaleDateString()}
                              </span>
                              {entry.imageUrl && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 uppercase tracking-wider">
                                  <ImageIcon className="w-2.5 h-2.5" /> Photo Saved
                                </span>
                              )}
                              {entry.location && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-medium text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded border border-[#1F2229]">
                                  <MapPin className="w-2.5 h-2.5 text-emerald-400" /> {entry.location.name}
                                </span>
                              )}
                            </div>
                            <h5 className="font-bold text-xs text-white truncate mt-1">{entry.title}</h5>
                          </div>

                          <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded uppercase tracking-wide shrink-0">
                            {entry.mood}
                          </span>
                        </div>

                        <div className="flex items-start gap-3">
                          {entry.imageUrl && (
                            <button
                              type="button"
                              onClick={() => setLightboxImage(entry.imageUrl || null)}
                              className="relative group shrink-0 h-16 w-16 rounded-lg overflow-hidden border border-[#1F2229] hover:border-zinc-500 bg-[#14151B] cursor-pointer transition"
                              title="Click to expand photo"
                            >
                              <img
                                src={entry.imageUrl}
                                alt="Archived reflection photo"
                                className="h-full w-full object-cover group-hover:scale-105 transition"
                              />
                            </button>
                          )}

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                              {entry.content}
                            </p>

                            {entry.themes && entry.themes.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {entry.themes.map((t, i) => (
                                  <span key={i} className="text-[8px] bg-slate-800/40 border border-[#1F2229] text-zinc-300 px-1.5 py-0.5 rounded">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0 self-center">
                            <button
                              type="button"
                              onClick={() => setActiveEntry(entry)}
                              title="Inspect full reflection summary"
                              className="p-1 hover:bg-[#15171C] rounded text-slate-400 hover:text-white cursor-pointer transition"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expand View Panel */}
                        {activeEntry?.id === entry.id && (
                          <div className="mt-3 pt-3 border-t border-[#1F2229] bg-[#15171C]/60 p-3 rounded-lg space-y-2.5 text-xs">
                            {entry.imageUrl && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3 text-zinc-400" />
                                    Archived Visual Page
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setLightboxImage(activeEntry.imageUrl || null)}
                                    className="text-[10px] text-zinc-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <ImageIcon className="w-3 h-3 text-zinc-300" />
                                    <span>View Photo</span>
                                  </button>
                                </div>
                                <div className="border border-[#1F2229] rounded-lg overflow-hidden bg-black/40 flex items-center justify-center p-1">
                                  <img
                                    src={entry.imageUrl}
                                    alt="Saved reflection attachment"
                                    onClick={() => setLightboxImage(entry.imageUrl || null)}
                                    className="max-h-48 w-auto rounded object-contain cursor-pointer hover:opacity-95 transition"
                                  />
                                </div>
                              </div>
                            )}
                            {entry.location && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>{entry.location.name}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide block">Synthesized summary:</span>
                              <p className="italic text-slate-300 leading-relaxed mt-0.5">&ldquo;{entry.summary || 'No summary extracted.'}&rdquo;</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Google Workspace Sync Settings */}
          {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto bg-[#0B0C0F] border border-[#15161C] rounded-2xl p-6 md:p-8 space-y-6 animate-fade-in text-left">
              <div>
                <h3 className="font-serif italic text-2xl text-white font-normal mb-1">Preferences & Sync</h3>
                <p className="text-xs text-slate-400">Manage inference engine architecture, on-device models, local databases, and Google Workspace integrations.</p>
              </div>

              {/* Local Model Manager Component */}
              <LocalModelManager
                onModeChange={(newMode) => {
                  setAppModeState(newMode);
                }}
                onModelChange={(newModelId) => {
                  setSelectedLocalModelState(newModelId);
                }}
              />

              {/* Cloud Database Connection Status */}
              <div className="bg-[#101116] border border-[#1B1C22] p-4 rounded-xl flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-zinc-300" />
                    Firestore Cloud Database
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {currentUser 
                      ? `Real-time synchronization active for user account (${currentUser.email || currentUser.uid.slice(0, 8)}).`
                      : "Connecting to secure Firestore cloud store..."}
                  </p>
                </div>
                <div>
                  {currentUser ? (
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      CONNECTED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      DISCONNECTED
                    </span>
                  )}
                </div>
              </div>

              {/* Status Section */}
              <div className="bg-[#101116] border border-[#1B1C22] p-4 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-200">Google Connection Status</div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {getCachedAccessToken() 
                      ? "Connected and ready to sync events and task checklists." 
                      : "Authorize Google account access to sync action items."}
                  </p>
                </div>
                {getCachedAccessToken() ? (
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded">
                      CONNECTED
                    </span>
                    <button
                      onClick={handleGoogleConnect}
                      className="text-[9px] font-bold text-zinc-300 hover:text-white underline cursor-pointer"
                    >
                      Reconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGoogleConnect}
                    className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Connect Google
                  </button>
                )}
              </div>

              {/* Sync Configuration Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#101116]/40 border border-[#15161C] rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">Google Calendar Event Sync</div>
                    <p className="text-[10px] text-slate-400">Automatically sync action items to Google Calendar as events.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncSettings.calendarEnabled}
                      onChange={() => handleToggleSync('calendar')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-200 peer-checked:after:bg-black peer-checked:after:border-black"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#101116]/40 border border-[#15161C] rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">Google Tasks Sync</div>
                    <p className="text-[10px] text-slate-400">Add action goals directly into your Google Tasks checklist.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncSettings.tasksEnabled}
                      onChange={() => handleToggleSync('tasks')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-200 peer-checked:after:bg-black peer-checked:after:border-black"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#101116]/40 border border-[#15161C] rounded-xl">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-200">Prompt Workspace Sync on Journal Save</div>
                    <p className="text-[10px] text-slate-400">Ask to push action goals to Google immediately upon saving an entry (Disabled by default to avoid interrupting your reflections).</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncSettings.promptOnSave}
                      onChange={() => handleToggleSync('promptOnSave')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-200 peer-checked:after:bg-black peer-checked:after:border-black"></div>
                  </label>
                </div>
              </div>

              {/* Information Footnote */}
              <div className="text-[10px] text-slate-500 font-sans leading-relaxed pt-2">
                * Note: Google Workspace connections are in-memory. For maximum security, access tokens are never saved to disk and will expire when you close this browser tab.
              </div>

              {/* Local Backup & Data Portability Card */}
              <div className="bg-[#101116] border border-[#1B1C22] p-5 rounded-xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Download className="w-4 h-4 text-zinc-300" />
                      Local Backup & Data Portability
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Download your full journal history to your local computer in formatted PDF or tabular CSV format. Complete privacy with zero cloud lock-in.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded uppercase shrink-0">
                    {entries.length} Logs
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => exportEntriesToPdf(entries)}
                    disabled={entries.length === 0}
                    className="flex items-center justify-between p-3.5 bg-[#15171C] hover:bg-[#1B1E24] border border-[#20222A] hover:border-zinc-500 rounded-xl text-left transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-300" />
                        Export All to PDF
                      </div>
                      <p className="text-[10px] text-slate-400">Formatted document with mood tags, AI summaries, & reflections</p>
                    </div>
                    <Download className="w-4 h-4 text-slate-500 group-hover:text-white transition shrink-0 ml-2" />
                  </button>

                  <button
                    type="button"
                    onClick={() => exportEntriesToCsv(entries)}
                    disabled={entries.length === 0}
                    className="flex items-center justify-between p-3.5 bg-[#15171C] hover:bg-[#1B1E24] border border-[#20222A] hover:border-emerald-500/40 rounded-xl text-left transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer group"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Table className="w-3.5 h-3.5 text-emerald-400" />
                        Export All to CSV
                      </div>
                      <p className="text-[10px] text-slate-400">Spreadsheet table for Excel, Google Sheets, or local analysis</p>
                    </div>
                    <Download className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition shrink-0 ml-2" />
                  </button>
                </div>
              </div>

              {/* On-Demand AI Reflection Prompts Card */}
              <div className="bg-[#101116] border border-[#1B1C22] p-5 rounded-xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-zinc-300" />
                      Guided Reflection Prompt
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Generate an optional thoughtful writing prompt tailored to your recent reflections and mood trajectory whenever you need inspiration.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGeneratePromptFromSettings}
                    disabled={isGeneratingPrompt}
                    className="inline-flex items-center gap-2 text-xs font-bold tracking-wider text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2.5 transition active:scale-95 disabled:opacity-40 select-none cursor-pointer shrink-0"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-zinc-300 ${isGeneratingPrompt ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingPrompt ? 'Generating...' : 'Generate Prompt'}</span>
                  </button>
                </div>

                {settingsPrompt && (
                  <div className="bg-[#15171C] border border-zinc-700 p-4 rounded-xl space-y-3 animate-fade-in text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                        Tailored Reflection Idea
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(settingsPrompt.prompt);
                          setPromptCopied(true);
                          setTimeout(() => setPromptCopied(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                        title="Copy prompt"
                      >
                        {promptCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-sm italic text-slate-200 font-serif leading-relaxed">
                      "{settingsPrompt.prompt}"
                    </p>
                    {settingsPrompt.contextReason && (
                      <p className="text-[11px] text-slate-400 leading-normal">
                        {settingsPrompt.contextReason}
                      </p>
                    )}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('chamber')}
                        className="text-xs font-bold text-black bg-zinc-100 hover:bg-white px-3.5 py-1.5 rounded-lg transition active:scale-95 cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-black/30"
                      >
                        <span>Start Writing in Chamber</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>

      {/* UNIFIED FLOATING POP-UP CHAT BOX & FAB (Active across all screen resolutions) */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-full max-w-[320px] md:max-w-[380px] h-[480px] shadow-2xl rounded-2xl border border-[#1F2229] p-4 overflow-hidden animate-fade-in bg-[#0D0E12]">
          <ChatLoop 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            onClose={() => setIsChatOpen(false)}
            appMode={appMode}
            selectedModelName={LOCAL_MODELS[selectedLocalModel].name}
          />
        </div>
      )}

      {/* FAB Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl border transition-all duration-300 transform active:scale-95 cursor-pointer ${
            isChatOpen 
              ? 'bg-zinc-100 border-white text-black rotate-90 scale-105' 
              : 'bg-[#15171C] border-[#1F2229] hover:border-slate-600 text-zinc-300 hover:text-white'
          }`}
          title="Open Conversational Sounding Board"
        >
          <MessageCircle className="w-6 h-6 shrink-0" />
          {!isChatOpen && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-zinc-400 rounded-full border-2 border-[#07080C] animate-pulse" />
          )}
        </button>
      </div>

      {/* Google Workspace Sync Modal Dialog */}
      {isSyncDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto select-none">
          <div className="relative w-full max-w-lg bg-[#0B0C0F] border border-[#15161C] rounded-2xl p-6 shadow-2xl space-y-5 text-left animate-fade-in">
            
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-serif italic text-xl text-white font-normal">Push to Google Workspace?</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">Choose which action goals you'd like to sync with Google Calendar and Google Tasks.</p>
              </div>
              <button
                onClick={() => setIsSyncDialogOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-[#15171C] transition cursor-pointer"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Check Token Status */}
            {!getCachedAccessToken() ? (
              <div className="bg-[#101116] border border-[#1B1C22] p-5 rounded-xl flex flex-col items-center text-center gap-3 py-6">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google Connection Offline</span>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Google Workspace integration is completely optional. You can connect now to push action goals to Google Calendar & Google Tasks, or keep reflections strictly local.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-2.5 mt-2 w-full justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSyncDialogOpen(false);
                      handleDisablePromptOnSave();
                    }}
                    className="w-full sm:w-auto px-4 py-2 border border-[#202129] hover:bg-[#15171C] text-slate-400 hover:text-slate-200 rounded-full text-xs font-semibold transition cursor-pointer"
                  >
                    Don't ask on entry save
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleConnectInModal}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#18112C] border border-[#342466] text-[#9E8CF4] hover:bg-[#20173A] rounded-full text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    Connect with Google
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* List of Tasks for Synchronization */}
                <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
                  {syncDialogTasks.map((task, idx) => (
                    <div key={task.id} className="p-4 bg-[#101116] border border-[#1B1C22] rounded-xl space-y-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-slate-500 text-xs font-mono font-bold mt-0.5">{idx + 1}.</span>
                        <div className="text-xs font-bold text-white leading-relaxed">{task.text}</div>
                      </div>

                      {/* Options split */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#15161C]">
                        
                        {/* Calendar Config */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={task.syncCalendar}
                              disabled={!syncSettings.calendarEnabled}
                              onChange={() => handleToggleTaskSyncOption(task.id, 'calendar')}
                              className="rounded border-[#1B1C22] text-zinc-200 bg-[#08080A] focus:ring-0"
                            />
                            <span className="text-[10px] font-bold text-slate-400">Google Calendar Event</span>
                          </label>
                          {task.syncCalendar && (
                            <input
                              type="datetime-local"
                              value={task.calendarTime}
                              onChange={(e) => handleUpdateTaskSyncTime(task.id, 'calendar', e.target.value)}
                              className="w-full text-[10px] bg-[#08080A] border border-[#1B1C22] text-slate-200 rounded p-1.5 focus:outline-none"
                            />
                          )}
                        </div>

                        {/* Tasks Config */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={task.syncTasks}
                              disabled={!syncSettings.tasksEnabled}
                              onChange={() => handleToggleTaskSyncOption(task.id, 'tasks')}
                              className="rounded border-[#1B1C22] text-zinc-200 bg-[#08080A] focus:ring-0"
                            />
                            <span className="text-[10px] font-bold text-slate-400">Google Task Item</span>
                          </label>
                          {task.syncTasks && (
                            <input
                              type="date"
                              value={task.tasksDueDate}
                              onChange={(e) => handleUpdateTaskSyncTime(task.id, 'tasks', e.target.value)}
                              className="w-full text-[10px] bg-[#08080A] border border-[#1B1C22] text-slate-200 rounded p-1.5 focus:outline-none"
                            />
                          )}
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

                {/* Feedback Toast embedded */}
                {syncFeedback && (
                  <div className={`p-3 rounded-lg border text-xs font-semibold text-center ${
                    syncFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    {syncFeedback.message}
                  </div>
                )}

                {/* Footer Controls */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#15161C]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSyncDialogOpen(false);
                      handleDisablePromptOnSave();
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
                  >
                    Don't prompt after saving
                  </button>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setIsSyncDialogOpen(false)}
                      disabled={isSyncingInProgress}
                      className="px-4 py-2 hover:bg-[#15171C] border border-[#15161C] text-slate-400 hover:text-slate-200 rounded-full text-xs font-bold transition cursor-pointer"
                    >
                      Skip Sync
                    </button>
                    <button
                      onClick={handlePushToWorkspace}
                      disabled={isSyncingInProgress}
                      className="px-5 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 hover:bg-zinc-700 rounded-full text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                    >
                      {isSyncingInProgress ? (
                        <>
                          <span className="w-3 h-3 border border-zinc-300 border-t-transparent rounded-full animate-spin"></span>
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Push to Workspace</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Floating Auth Notification Toast */}
      {authError && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm w-full bg-[#0B0C0F] border border-rose-500/20 shadow-2xl rounded-xl p-4 animate-fade-in flex items-start gap-3">
          <div className="bg-rose-500/10 text-rose-400 p-2 rounded-lg shrink-0 mt-0.5">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setAuthError(null)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-200">Connection Attention</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{authError}</p>
            <div className="mt-2.5 flex items-center gap-3">
              <button
                onClick={() => setAuthError(null)}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setAuthError(null);
                  if (activeTab === 'settings') {
                    handleGoogleConnect();
                  } else {
                    setActiveTab('settings');
                  }
                }}
                className="text-[10px] font-bold text-zinc-300 hover:text-white cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
          <button
            onClick={() => setAuthError(null)}
            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating App Notice Toast */}
      {noticeMessage && (
        <div className="fixed bottom-6 left-6 z-[100] max-w-sm w-full bg-[#0B0C0F] border border-zinc-700 shadow-2xl rounded-xl p-4 animate-fade-in flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
            noticeMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400' :
            noticeMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
            'bg-zinc-800 text-zinc-300'
          }`}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-200">{noticeMessage.title}</div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{noticeMessage.message}</p>
          </div>
          <button
            onClick={() => setNoticeMessage(null)}
            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Elegant Secure Deletion Modal */}
      {entryToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B0C0F] border border-[#1F2229] rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="bg-rose-500/10 text-rose-400 p-2.5 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Delete Reflection Log?</h4>
                <p className="text-[10px] text-slate-500 font-sans tracking-wider uppercase mt-0.5">PERMANENT ACTIONS</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to permanently erase this secure reflection entry? This action cannot be undone and will delete it across all linked devices.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="px-4 py-2 hover:bg-[#15171C] text-xs font-bold text-slate-400 hover:text-slate-200 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEntry}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white rounded-lg transition cursor-pointer"
              >
                Erase Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal for Archives */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-4xl max-h-[90vh] p-3 bg-[#0B0C0F] border border-[#1F2229] rounded-2xl shadow-2xl flex flex-col cursor-default"
          >
            <div className="flex items-center justify-between pb-2.5 px-2 border-b border-[#1F2229]">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-zinc-300" />
                Archived Reflection Page
              </span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2.5 overflow-auto flex items-center justify-center max-h-[80vh] p-1 bg-black/50 rounded-xl">
              <img
                src={lightboxImage}
                alt="Full size reflection archive"
                className="max-h-[75vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Model Download Required when attempting local inference before downloading */}
      {localDownloadModalOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#0B0C0F] border border-[#1B1C22] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Model Download Required
                </h4>
                <p className="text-[10px] text-amber-400 font-mono">
                  Full-Local Mode Active • {LOCAL_MODELS[selectedLocalModel].name} ({LOCAL_MODELS[selectedLocalModel].size})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#101116] p-3.5 rounded-xl border border-[#1B1C22]">
              You have selected <strong>Full-Local Mode</strong>. To run offline, on-device analysis and vector embedding without transmitting data to cloud servers, please download the weights for{' '}
              <strong className="text-white">{LOCAL_MODELS[selectedLocalModel].name}</strong> ({LOCAL_MODELS[selectedLocalModel].size}).
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setLocalDownloadModalOpen(false);
                  setAppModeState('cloud');
                  setAppMode('cloud');
                }}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-[#23242E] rounded-xl transition cursor-pointer text-center"
              >
                Switch to Fast Cloud API
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocalDownloadModalOpen(false);
                  setActiveTab('settings');
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-zinc-100 hover:bg-white text-black rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-black/40 text-center"
              >
                Open Model Manager ({LOCAL_MODELS[selectedLocalModel].size})
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

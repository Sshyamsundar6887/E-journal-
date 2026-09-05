import { useState, FormEvent } from 'react';
import { ActionItem } from '../types';
import { CheckSquare, Square, ClipboardList, Plus, Trash2, Calendar } from 'lucide-react';

interface ActionItemsProps {
  items: ActionItem[];
  onToggleItem: (itemId: string) => void;
  onAddItem: (text: string) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenSync?: () => void;
}

export default function ActionItems({ items, onToggleItem, onAddItem, onDeleteItem, onOpenSync }: ActionItemsProps) {
  const [newItemText, setNewItemText] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    onAddItem(newItemText.trim());
    setNewItemText("");
  };

  const completedCount = items.filter(i => i.completed).length;

  return (
    <div className="bg-[#0F1115] p-5 rounded-xl border border-[#1F2229] space-y-4 text-[#E2E8F0]">
      <div className="flex items-center justify-between border-b border-[#1F2229] pb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Extracted Action Checklist</h3>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSync && items.length > 0 && (
            <button
              type="button"
              onClick={onOpenSync}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1 rounded-md transition cursor-pointer"
              title="Sync actions with Google Workspace"
            >
              <Calendar className="w-3 h-3 text-zinc-300" />
              <span>Sync to Google</span>
            </button>
          )}
          <span className="text-xs bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded-md text-zinc-300 font-sans">
            {completedCount}/{items.length} Done
          </span>
        </div>
      </div>

      {/* Checklist Entries */}
      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 italic">
            No actionable commitments found. Try venting a brain dump or writing your goals above!
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between group p-2 rounded-lg border transition ${
                item.completed ? 'bg-[#15171C]/40 border-[#1F2229]/60 text-slate-500 line-through' : 'bg-[#15171C] border-[#1F2229] text-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleItem(item.id)}
                className="flex items-center gap-2.5 text-left flex-1"
              >
                {item.completed ? (
                  <CheckSquare className="w-4.5 h-4.5 text-zinc-200 shrink-0" />
                ) : (
                  <Square className="w-4.5 h-4.5 text-slate-600 hover:text-slate-400 shrink-0" />
                )}
                <span className="text-xs font-sans font-medium break-all">{item.text}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteItem(item.id);
                }}
                className="opacity-80 hover:opacity-100 transition p-1 hover:bg-[#0F1115] rounded text-slate-400 hover:text-rose-400 ml-2 cursor-pointer shrink-0"
                title="Delete Action"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Manual Add Line */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t border-[#1F2229]">
        <input
          type="text"
          placeholder="Add manual goal..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          className="flex-1 text-xs border border-[#1F2229] rounded-lg px-3 py-2 bg-[#15171C] text-white placeholder-slate-600 focus:outline-none focus:border-zinc-500 transition"
        />
        <button
          type="submit"
          className="bg-zinc-100 hover:bg-white text-black p-2 rounded-lg transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

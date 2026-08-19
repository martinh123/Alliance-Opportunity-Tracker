import { useRef, useState } from "react";
import type { Note } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";

import { makeId } from "@/lib/uid";
import { NoteText } from "@/components/note-text";
import { ReminderButton, type ReminderContext } from "@/components/reminder-button";

function fmtTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Reusable list editor for a set of structured notes (add / edit / delete).
 * Fully controlled: it never mutates on its own — every change is emitted via
 * onChange with the full next array, so the parent decides how to persist it
 * (immediate save for existing records, or held in form state until submit).
 */
export function NotesEditor({
  notes,
  onChange,
  placeholder = "Type your note…",
  saving = false,
  compact = false,
  reminder = null,
}: {
  notes: Note[];
  onChange: (notes: Note[]) => void;
  placeholder?: string;
  saving?: boolean;
  compact?: boolean;
  /** When set, an "Add reminder" button appears next to "Add a note" carrying this association. */
  reminder?: ReminderContext | null;
}) {
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const addRef = useRef<HTMLTextAreaElement>(null);

  const sorted = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    const note: Note = { id: makeId(), text, createdAt: new Date().toISOString() };
    onChange([note, ...notes]);
    setNewText("");
    setAdding(false);
  };

  const handleDelete = (id: string) => onChange(notes.filter((n) => n.id !== id));

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const handleEditSave = () => {
    if (!editingId) return;
    onChange(notes.map((n) => (n.id === editingId ? { ...n, text: editText.trim() || n.text } : n)));
    setEditingId(null);
  };

  return (
    <div className="space-y-2">
      {adding ? (
        <div className="space-y-2">
          <Textarea
            ref={addRef}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={placeholder}
            rows={3}
            autoFocus
            className="text-sm resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAdd(); }
              if (e.key === "Escape") { setAdding(false); setNewText(""); }
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(false); setNewText(""); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleAdd} disabled={!newText.trim() || saving}>
              {saving ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
              Add note
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={() => { setAdding(true); setTimeout(() => addRef.current?.focus(), 50); }}
          >
            <Plus size={13} />Add a note
          </Button>
          {reminder && <ReminderButton context={reminder} />}
        </div>
      )}

      {sorted.length === 0 ? (
        !adding && (
          <div className={compact ? "text-center py-4 text-xs text-muted-foreground" : "text-center py-8 text-xs text-muted-foreground"}>
            <MessageSquare size={compact ? 18 : 22} className="mx-auto mb-2 opacity-30" />
            No notes yet
          </div>
        )
      ) : (
        <div className="space-y-2">
          {sorted.map((note) => (
            <div key={note.id} className="group/note rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5">
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    autoFocus
                    className="text-sm resize-y"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleEditSave(); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditingId(null)} className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"><X size={13} /></button>
                    <button type="button" onClick={handleEditSave} disabled={saving} className="p-1 rounded bg-primary text-primary-foreground hover:opacity-90">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <NoteText text={note.text} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{fmtTime(note.createdAt)}</span>
                    <div className="flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                      <button type="button" onClick={() => startEdit(note)} title="Edit" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil size={11} />
                      </button>
                      <button type="button" onClick={() => handleDelete(note.id)} title="Delete" className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

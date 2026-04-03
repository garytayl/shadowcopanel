"use client";

import { useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

import type { ModRowPayload } from "@/lib/actions/mods";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Row = ModRowPayload & { key: string };

function SortableRow({
  row,
  onRemove,
  onToggle,
}: {
  row: Row;
  onRemove: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-xl border border-border/70 bg-card/80 p-3"
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium leading-tight">{row.name || row.modId}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{row.modId}</p>
        {row.version ? (
          <p className="text-xs text-muted-foreground">v{row.version}</p>
        ) : null}
        <div className="flex items-center gap-2 pt-1">
          <Switch checked={row.enabled} onCheckedChange={onToggle} id={`en-${row.key}`} />
          <label htmlFor={`en-${row.key}`} className="text-xs text-muted-foreground">
            Enabled
          </label>
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove">
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </li>
  );
}

type Props = {
  rows: Row[];
  onChange: (rows: Row[]) => void;
};

export function MarketplaceStack({ rows, onChange }: Props) {
  const ids = useMemo(() => rows.map((r) => r.key), [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.key === active.id);
    const newIndex = rows.findIndex((r) => r.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(rows, oldIndex, newIndex));
  }

  function updateAt(index: number, patch: Partial<ModRowPayload>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeAt(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No mods in stack. Add from the catalog or paste a workshop URL.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <SortableRow
              key={row.key}
              row={row}
              onRemove={() => removeAt(index)}
              onToggle={(enabled) => updateAt(index, { enabled })}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

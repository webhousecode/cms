/**
 * Drag-and-drop reorderable list of workflow steps.
 *
 * Built on @dnd-kit/sortable. Used by the workflow create/edit form
 * in WorkflowsTab. The parent owns the steps array (a list of agent
 * IDs); this component just renders the rows + emits the new order
 * after a drag.
 *
 * Each row also exposes a remove button so the curator can prune
 * steps without leaving the editor.
 */
"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

interface Props {
  /** Stable id per row — composite of agentId + index works fine since rows don't repeat in normal use */
  steps: { id: string; agentId: string; agentName: string; overrideCollection?: string }[];
  onReorder: (steps: { id: string; agentId: string; agentName: string; overrideCollection?: string }[]) => void;
  onRemove: (id: string) => void;
  /** Phase 6 polish — let curators override the target collection per
   *  step. Optional; pass undefined to hide the inline input entirely. */
  onCollectionChange?: (id: string, value: string) => void;
}

export function SortableWorkflowSteps({ steps, onReorder, onRemove, onCollectionChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small drag distance before starting so an accidental
      // click on the grip handle doesn't immediately enter drag mode
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(steps, oldIndex, newIndex));
  }

  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic mb-2">
        No steps yet — add agents below.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5 mb-3">
          {steps.map((step, idx) => (
            <SortableStep
              key={step.id}
              id={step.id}
              index={idx}
              agentName={step.agentName}
              overrideCollection={step.overrideCollection}
              onRemove={() => onRemove(step.id)}
              onCollectionChange={onCollectionChange ? (v) => onCollectionChange(step.id, v) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableStep({
  id,
  index,
  agentName,
  overrideCollection,
  onRemove,
  onCollectionChange,
}: {
  id: string;
  index: number;
  agentName: string;
  overrideCollection?: string;
  onRemove: () => void;
  onCollectionChange?: (value: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "var(--secondary)" : "var(--card)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-md border border-border"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        style={{ background: "transparent", border: "none", padding: 0 }}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-[0.65rem] font-mono text-muted-foreground w-6">#{index + 1}</span>
      <span className="text-sm flex-1 font-medium">{agentName}</span>
      {onCollectionChange && (
        <input
          type="text"
          value={overrideCollection ?? ""}
          onChange={(e) => onCollectionChange(e.target.value)}
          placeholder="collection (optional)"
          title="Override the agent's default target collection for this step"
          className="text-[0.7rem] font-mono px-1.5 py-0.5 rounded border border-border bg-background"
          style={{ width: "11rem" }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Remove step"
        className="text-xs px-1.5 py-0.5 rounded text-destructive hover:bg-destructive/10"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

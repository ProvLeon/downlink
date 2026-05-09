"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CloudDownload, Clock, Trash2, Zap, FolderOpen, GripVertical } from "lucide-react";
import { DownloadItem } from "./DownloadItem";
import type { QueueItem } from "../types";
import { formatSpeed } from "../types";

interface DownloadQueueProps {
  queue: QueueItem[];
  history: QueueItem[];
  showHistory: boolean;
  onShowHistoryChange: (value: boolean) => void;
  onStop: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onClearQueue: () => void;
  onClearHistory: () => void;
}

// ── Sortable wrapper for a single queue item ──────────────────────
function SortableQueueItem({
  item,
  isDraggingOverlay = false,
  ...props
}: {
  item: QueueItem;
  isDraggingOverlay?: boolean;
  onStop: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (path: string) => void;
  onOpenFolder: (path: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isActive = item.status === "downloading" || item.status === "postprocessing" ||
    item.status === "fetching";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-stretch gap-0 rounded-xl transition-all ${
        isDragging ? "dnd-dragging" : ""
      } ${isDraggingOverlay ? "dnd-drag-overlay" : ""}`}
    >
      {/* Drag handle — only for queue items, not history */}
      {!isActive && (
        <button
          className="flex w-5 flex-shrink-0 cursor-grab items-center justify-center rounded-l-xl opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          tabIndex={-1}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 text-zinc-600" />
        </button>
      )}

      <div className={`min-w-0 flex-1 ${!isActive ? "-ml-5 group-hover:ml-0 transition-all duration-150" : ""}`}>
        <DownloadItem
          item={item}
          onStop={props.onStop}
          onCancel={props.onCancel}
          onRemove={props.onRemove}
          onRetry={props.onRetry}
          onOpen={props.onOpen}
          onOpenFolder={props.onOpenFolder}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
export function DownloadQueue({
  queue,
  history,
  showHistory,
  onShowHistoryChange,
  onStop,
  onCancel,
  onRemove,
  onRetry,
  onOpen,
  onOpenFolder,
  onClearQueue,
  onClearHistory,
}: DownloadQueueProps) {
  const [orderedQueue, setOrderedQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Keep orderedQueue in sync with queue prop, inserting new items
  const displayQueue = (() => {
    if (orderedQueue.length === 0) return queue;
    const queueIds = new Set(queue.map((q) => q.id));
    const orderedIds = new Set(orderedQueue.map((q) => q.id));
    // Remove items no longer in queue, add new ones at end
    const filtered = orderedQueue.filter((q) => queueIds.has(q.id));
    const newItems = queue.filter((q) => !orderedIds.has(q.id));
    return [...filtered, ...newItems];
  })();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      setOrderedQueue((prev) => {
        const base = prev.length > 0 ? prev : queue;
        const oldIndex = base.findIndex((q) => q.id === active.id);
        const newIndex = base.findIndex((q) => q.id === over.id);
        return arrayMove(base, oldIndex, newIndex);
      });
    }
  };

  const activeItem = activeId ? displayQueue.find((q) => q.id === activeId) : null;

  const activeItems = queue.filter(
    (q) => q.status === "downloading" || q.status === "postprocessing"
  );
  const pendingCount = queue.filter(
    (q) => q.status === "queued" || q.status === "ready" || q.status === "fetching"
  ).length;

  const totalSpeedBps = activeItems.reduce((sum, item) => sum + (item.speed_bps ?? 0), 0);
  const hasActiveDownloads = activeItems.length > 0;

  const items = showHistory ? history : displayQueue;
  const isEmpty = items.length === 0;

  // "Reveal All" — history items with a local path
  const completedWithPath = history.filter((h) => h.final_path);
  const showRevealAll = showHistory && completedWithPath.length >= 2;

  const handleRevealAll = () => {
    // Open the folder of the first completed item — macOS Finder will highlight it
    const first = completedWithPath[0];
    if (first?.final_path) onOpenFolder(first.final_path);
  };

  return (
    <div className="flex w-full flex-col border-l border-zinc-800/80 bg-zinc-950 h-full">
      {/* ── Header / Tabs ──────────────────────────────── */}
      <div className="flex border-b border-zinc-800/80 px-1 pt-1">
        <button
          type="button"
          onClick={() => onShowHistoryChange(false)}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-2.5 text-xs font-medium transition-colors ${
            !showHistory ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <CloudDownload className="h-3.5 w-3.5" />
          <span>Downloads</span>
          {queue.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                !showHistory ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {queue.length}
            </span>
          )}
          {!showHistory && (
            <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-blue-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onShowHistoryChange(true)}
          className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-2.5 text-xs font-medium transition-colors ${
            showHistory ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>History</span>
          {history.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                showHistory ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {history.length}
            </span>
          )}
          {showHistory && (
            <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-blue-500" />
          )}
        </button>
      </div>

      {/* ── Aggregate stats bar (active downloads only) ── */}
      {!showHistory && hasActiveDownloads && (
        <div className="flex items-center gap-2 border-b border-zinc-800/60 bg-blue-500/5 px-3 py-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20">
            <Zap className="h-3 w-3 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-blue-300">
              {activeItems.length} downloading
              {pendingCount > 0 && (
                <span className="text-zinc-500">, {pendingCount} queued</span>
              )}
            </span>
          </div>
          {totalSpeedBps > 0 && (
            <span className="text-[11px] font-semibold text-blue-400 tabular-nums">
              {formatSpeed(totalSpeedBps)}
            </span>
          )}
        </div>
      )}

      {/* ── "Reveal All" batch bar (history with 2+ completed) ── */}
      {showRevealAll && (
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/50 px-3 py-1.5">
          <span className="text-[11px] text-zinc-500">
            {completedWithPath.length} downloads saved
          </span>
          <button
            type="button"
            onClick={handleRevealAll}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <FolderOpen className="h-3 w-3" />
            Reveal All
          </button>
        </div>
      )}

      {/* ── Item list ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
            {showHistory ? (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/80">
                  <Clock className="h-6 w-6 text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-500">No history yet</p>
                <p className="mt-1 text-xs text-zinc-600">Completed downloads will appear here</p>
              </>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/80">
                  <CloudDownload className="h-6 w-6 text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-500">No downloads yet</p>
                <p className="mt-1 text-xs text-zinc-600">Paste a URL above to get started</p>
              </>
            )}
          </div>
        ) : showHistory ? (
          // History — no drag-to-reorder needed
          items.map((item) => (
            <DownloadItem
              key={item.id}
              item={item}
              onStop={onStop}
              onCancel={onCancel}
              onRemove={onRemove}
              onRetry={onRetry}
              onOpen={onOpen}
              onOpenFolder={onOpenFolder}
            />
          ))
        ) : (
          // Queue — drag-to-reorder with dnd-kit
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayQueue.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayQueue.map((item) => (
                <SortableQueueItem
                  key={item.id}
                  item={item}
                  onStop={onStop}
                  onCancel={onCancel}
                  onRemove={onRemove}
                  onRetry={onRetry}
                  onOpen={onOpen}
                  onOpenFolder={onOpenFolder}
                />
              ))}
            </SortableContext>

            {/* Drag overlay — shows the card floating while dragging */}
            <DragOverlay>
              {activeItem ? (
                <SortableQueueItem
                  item={activeItem}
                  isDraggingOverlay
                  onStop={onStop}
                  onCancel={onCancel}
                  onRemove={onRemove}
                  onRetry={onRetry}
                  onOpen={onOpen}
                  onOpenFolder={onOpenFolder}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── Footer: clear button ───────────────────────── */}
      {!isEmpty && (
        <div className="border-t border-zinc-800/80 p-2">
          <button
            type="button"
            onClick={showHistory ? onClearHistory : onClearQueue}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {showHistory ? "Clear History" : "Clear Queue"}
          </button>
        </div>
      )}
    </div>
  );
}

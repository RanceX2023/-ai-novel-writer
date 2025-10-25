import clsx from 'clsx';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OutlineNode,
  OutlineBeat,
  OutlineGenerationPayload,
  OutlineNodeUpsertPayload,
  OutlineReorderUpdate,
} from '../../types/outline';
import {
  fetchOutline,
  generateOutline as generateOutlineApi,
  upsertOutlineNode,
  reorderOutlineNodes,
  deleteOutlineNode,
} from '../../api/outline';
import { useToast } from '../ui/ToastProvider';

interface OutlinePanelProps {
  projectId: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

type ContainersMap = Record<string, string[]>;

type NodeMap = Map<string, OutlineNode>;

const ROOT_CONTAINER_ID = 'root';

function cloneBeat(beat: OutlineBeat): OutlineBeat {
  return {
    ...beat,
    tags: Array.isArray(beat.tags) ? [...beat.tags] : [],
    meta: beat.meta ? { ...beat.meta } : beat.meta ?? null,
  };
}

function cloneOutlineNode(node: OutlineNode): OutlineNode {
  return {
    ...node,
    tags: Array.isArray(node.tags) ? [...node.tags] : [],
    beats: Array.isArray(node.beats) ? node.beats.map(cloneBeat) : [],
    meta: node.meta ? { ...node.meta } : node.meta ?? null,
    children: [],
  };
}

function buildContainers(tree: OutlineNode[]): ContainersMap {
  const containers: ContainersMap = { [ROOT_CONTAINER_ID]: [] };

  const visit = (nodes: OutlineNode[], parentId: string | null) => {
    const containerId = parentId ?? ROOT_CONTAINER_ID;
    if (!containers[containerId]) {
      containers[containerId] = [];
    }
    nodes
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((node) => {
        containers[containerId].push(node.nodeId);
        if (!containers[node.nodeId]) {
          containers[node.nodeId] = [];
        }
        if (node.children?.length) {
          visit(node.children, node.nodeId);
        }
      });
  };

  visit(tree, null);
  return containers;
}

function buildNodeMap(tree: OutlineNode[]): NodeMap {
  const map = new Map<string, OutlineNode>();
  const walk = (nodes: OutlineNode[]) => {
    nodes.forEach((node) => {
      map.set(node.nodeId, node);
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  walk(tree);
  return map;
}

function rebuildTreeFromContainers(containers: ContainersMap, originalMap: NodeMap): OutlineNode[] {
  const cloneMap = new Map<string, OutlineNode>();
  originalMap.forEach((node, id) => {
    const cloned = cloneOutlineNode(node);
    cloned.createdAt = node.createdAt;
    cloned.updatedAt = node.updatedAt;
    cloneMap.set(id, cloned);
  });

  const roots: OutlineNode[] = [];
  const rootChildren = containers[ROOT_CONTAINER_ID] ?? [];
  rootChildren.forEach((childId, index) => {
    const node = cloneMap.get(childId);
    if (!node) {
      return;
    }
    node.parentId = null;
    node.order = index;
    roots.push(node);
  });

  Object.entries(containers).forEach(([containerId, childIds]) => {
    if (containerId === ROOT_CONTAINER_ID) {
      return;
    }
    const parent = cloneMap.get(containerId);
    if (!parent) {
      return;
    }
    parent.children = [];
    childIds.forEach((childId, index) => {
      const child = cloneMap.get(childId);
      if (!child) {
        return;
      }
      child.parentId = containerId;
      child.order = index;
      parent.children.push(child);
    });
  });

  return roots;
}

function findNode(nodes: OutlineNode[], nodeId: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.nodeId === nodeId) {
      return node;
    }
    if (node.children?.length) {
      const found = findNode(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function insertNode(nodes: OutlineNode[], parentId: string | null, newNode: OutlineNode): OutlineNode[] {
  if (parentId === null) {
    const next = [...nodes, { ...newNode }];
    return next.map((node, index) => ({ ...node, order: index }));
  }
  return nodes.map((node) => {
    if (node.nodeId === parentId) {
      const nextChildren = [...node.children, { ...newNode }].map((child, index) => ({ ...child, order: index, parentId }));
      return { ...node, children: nextChildren };
    }
    if (node.children?.length) {
      return { ...node, children: insertNode(node.children, parentId, newNode) };
    }
    return node;
  });
}

function removeNode(nodes: OutlineNode[], nodeId: string): { tree: OutlineNode[]; removed: OutlineNode | null; parentId: string | null } {
  const result: OutlineNode[] = [];
  let removed: OutlineNode | null = null;
  let parentId: string | null = null;

  nodes.forEach((node) => {
    if (node.nodeId === nodeId) {
      removed = node;
      parentId = node.parentId ?? null;
      return;
    }
    if (node.children?.length) {
      const { tree, removed: childRemoved, parentId: childParent } = removeNode(node.children, nodeId);
      if (childRemoved) {
        removed = childRemoved;
        parentId = childParent ?? node.nodeId;
        result.push({ ...node, children: tree.map((child, index) => ({ ...child, order: index, parentId: node.nodeId })) });
        return;
      }
      if (tree !== node.children) {
        result.push({ ...node, children: tree });
        return;
      }
    }
    result.push(node);
  });

  if (removed) {
    return {
      tree: result.map((node, index) => ({ ...node, order: index })),
      removed,
      parentId,
    };
  }

  return { tree: nodes, removed: null, parentId: null };
}

function updateNodeInTree(nodes: OutlineNode[], updatedNode: OutlineNode): OutlineNode[] {
  return nodes.map((node) => {
    if (node.nodeId === updatedNode.nodeId) {
      return {
        ...updatedNode,
        children: updatedNode.children ?? node.children,
      };
    }
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, updatedNode) };
    }
    return node;
  });
}

function OutlineDropZone({ containerId, depth }: { containerId: string; depth: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'my-1 rounded border border-dashed border-slate-700/60 bg-slate-900/40 transition-all',
        isOver ? 'h-10 border-brand/60 bg-brand/20 shadow-glow' : 'h-6'
      )}
      style={{ marginLeft: depth * 16 + 8 }}
    />
  );
}

interface OutlineNodeCardProps {
  node: OutlineNode;
  depth: number;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
  onChange: (nodeId: string, payload: OutlineNodeUpsertPayload) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
}

const OutlineNodeCard = ({ node, depth, isSelected, onSelect, onChange, onAddChild, onDelete }: OutlineNodeCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.nodeId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [title, setTitle] = useState(node.title);
  const [summary, setSummary] = useState(node.summary);

  useEffect(() => {
    setTitle(node.title);
    setSummary(node.summary);
  }, [node.nodeId, node.title, node.summary]);

  const handleBlur = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitle(node.title);
      return;
    }
    if (trimmedTitle !== node.title || summary !== node.summary) {
      onChange(node.nodeId, {
        nodeId: node.nodeId,
        parentId: node.parentId,
        title: trimmedTitle,
        summary,
      });
    }
  }, [node.nodeId, node.parentId, node.title, node.summary, onChange, summary, title]);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, marginLeft: depth * 12 }}
      className={clsx(
        'mb-2 rounded-xl border border-slate-800/70 bg-slate-900/70 p-3 transition shadow-sm',
        isSelected ? 'border-brand/60 bg-brand/10 shadow-glow' : '',
        isDragging ? 'opacity-80 ring-2 ring-brand/70' : ''
      )}
      onClick={() => onSelect(node.nodeId)}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-1 cursor-grab select-none rounded-full border border-slate-700/60 bg-slate-800/70 px-2 py-1 text-xs text-slate-300 hover:border-brand/50 hover:text-brand"
          {...attributes}
          {...listeners}
          aria-label="拖动调整位置"
          onClick={(event) => event.stopPropagation()}
        >
          ⇅
        </button>
        <div className="flex-1 space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={handleBlur}
            placeholder="节点标题"
            className="w-full rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 py-1.5 text-sm text-slate-100 focus:border-brand focus:outline-none"
          />
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onBlur={handleBlur}
            placeholder="节点摘要"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:border-brand focus:outline-none"
          />
          {node.beats?.length ? (
            <div className="rounded-lg border border-slate-800/60 bg-slate-950/50 p-2">
              <p className="text-xs font-medium text-slate-400">节拍</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-300">
                {node.beats.map((beat, index) => (
                  <li key={beat.beatId}>
                    <span className="font-semibold text-brand">#{index + 1}</span>{' '}
                    {beat.title ? `${beat.title}：` : ''}
                    {beat.summary}
                    {beat.focus ? <span className="text-slate-500">（焦点：{beat.focus}）</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            {node.tags?.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-800/60 px-2 py-0.5 text-slate-300">
                #{tag}
              </span>
            ))}
            {node.status ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">{node.status}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="rounded-full border border-brand/40 px-3 py-1 font-medium text-brand transition hover:border-brand hover:text-brand"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild(node.nodeId);
              }}
            >
              添加子节点
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-700/70 px-3 py-1 font-medium text-slate-300 transition hover:border-rose-400/70 hover:text-rose-200"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(node.nodeId);
              }}
            >
              删除
            </button>
          </div>
        </div>
        <div className="flex items-start pt-1">
          <input
            type="radio"
            checked={isSelected}
            onChange={() => onSelect(node.nodeId)}
            className="mt-1 h-4 w-4 cursor-pointer accent-brand"
          />
        </div>
      </div>
    </div>
  );
};

function OutlineTree({
  nodes,
  parentId,
  depth,
  selectedNodeId,
  onSelect,
  onChange,
  onAddChild,
  onDelete,
}: {
  nodes: OutlineNode[];
  parentId: string | null;
  depth: number;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onChange: (nodeId: string, payload: OutlineNodeUpsertPayload) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
}) {
  const items = nodes.map((node) => node.nodeId);
  const containerId = parentId ?? ROOT_CONTAINER_ID;
  return (
    <SortableContext id={containerId} items={items} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => (
        <div key={node.nodeId}>
          <OutlineNodeCard
            node={node}
            depth={depth}
            isSelected={selectedNodeId === node.nodeId}
            onSelect={onSelect}
            onChange={onChange}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
          <OutlineTree
            nodes={node.children}
            parentId={node.nodeId}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            onChange={onChange}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        </div>
      ))}
      <OutlineDropZone containerId={containerId} depth={depth} />
    </SortableContext>
  );
}

const OutlinePanel = ({ projectId, selectedNodeId, onSelectNode }: OutlinePanelProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [structure, setStructure] = useState<'three_act' | 'five_act'>('three_act');
  const [chapterCount, setChapterCount] = useState<number>(12);
  const [targetLength, setTargetLength] = useState<number>(1600);
  const [styleStrength, setStyleStrength] = useState<number>(0.65);

  const outlineQuery = useQuery({
    queryKey: ['outline', projectId],
    queryFn: () => fetchOutline(projectId),
    enabled: Boolean(projectId),
  });

  const [containers, setContainers] = useState<ContainersMap>({ [ROOT_CONTAINER_ID]: [] });
  const containersRef = useRef(containers);
  containersRef.current = containers;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const outline = outlineQuery.data ?? [];
    if (outline.length) {
      const nextContainers = buildContainers(outline);
      setContainers(nextContainers);
    } else {
      setContainers({ [ROOT_CONTAINER_ID]: [] });
    }
  }, [outlineQuery.data]);

  useEffect(() => {
    const outline = outlineQuery.data ?? [];
    if (!outline.length) {
      onSelectNode(null);
      return;
    }
    if (selectedNodeId && findNode(outline, selectedNodeId)) {
      return;
    }
    onSelectNode(outline[0].nodeId);
  }, [outlineQuery.data, onSelectNode, selectedNodeId]);

  const generateMutation = useMutation({
    mutationFn: (payload: OutlineGenerationPayload) => generateOutlineApi(projectId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['outline', projectId], data.outline ?? []);
      toast({ title: '大纲已生成', description: 'AI 已完成大纲草案，请审阅并调整。', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: '生成失败', description: error.message, variant: 'error' });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: OutlineNodeUpsertPayload) => upsertOutlineNode(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outline', projectId] });
      toast({ title: '节点已更新', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: '保存失败', description: error.message, variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (nodeId: string) => deleteOutlineNode(projectId, nodeId),
    onSuccess: (_result, nodeId) => {
      queryClient.setQueryData<OutlineNode[]>(['outline', projectId], (current) => {
        if (!current) {
          return current;
        }
        const { tree } = removeNode(current, nodeId);
        return tree;
      });
      toast({ title: '节点已删除', variant: 'success' });
      if (selectedNodeId === nodeId) {
        const outline = queryClient.getQueryData<OutlineNode[]>(['outline', projectId]) ?? [];
        onSelectNode(outline[0]?.nodeId ?? null);
      }
    },
    onError: (error: Error) => {
      toast({ title: '删除失败', description: error.message, variant: 'error' });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (updates: OutlineReorderUpdate[]) => reorderOutlineNodes(projectId, updates),
    onError: (error: Error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['outline', projectId], context.previous);
      }
      toast({ title: '排序失败', description: error.message, variant: 'error' });
    },
  });

  const outline = outlineQuery.data ?? [];
  const nodesMap = useMemo(() => buildNodeMap(outline), [outline]);

  const findContainer = useCallback(
    (id: string | symbol | null | undefined) => {
      if (!id || typeof id !== 'string') {
        return null;
      }
      if (containersRef.current[id]) {
        return id;
      }
      const entries = Object.entries(containersRef.current);
      for (const [containerId, items] of entries) {
        if (items.includes(id)) {
          return containerId;
        }
      }
      return null;
    },
    []
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) {
      return;
    }

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId) ?? (containersRef.current[overId] ? overId : null);
    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setContainers((prev) => {
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const activeIndex = activeItems.indexOf(activeId);
      const overIndex = overItems.indexOf(overId);

      const newActiveItems = activeItems.filter((item) => item !== activeId);
      const insertIndex = overIndex >= 0 ? overIndex + 1 : overItems.length;
      const newOverItems = [...overItems];
      newOverItems.splice(insertIndex, 0, activeId);

      return {
        ...prev,
        [activeContainer]: newActiveItems,
        [overContainer]: newOverItems,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setContainers(buildContainers(outline));
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const previousContainers = containersRef.current;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId) ?? (previousContainers[overId] ? overId : null);

    if (!activeContainer || !overContainer) {
      setContainers(buildContainers(outline));
      setActiveId(null);
      return;
    }

    const baseContainers: ContainersMap = Object.fromEntries(
      Object.entries(previousContainers).map(([key, items]) => [key, items.filter((item) => item !== activeId)])
    );

    const targetItems = baseContainers[overContainer] ?? [];
    const sortableIndex = over.data.current?.sortable?.index;
    let insertIndex = typeof sortableIndex === 'number' ? sortableIndex : targetItems.indexOf(overId);
    if (insertIndex < 0 || Number.isNaN(insertIndex)) {
      insertIndex = targetItems.length;
    }

    const updatedTarget = [...targetItems];
    updatedTarget.splice(insertIndex, 0, activeId);
    baseContainers[overContainer] = updatedTarget;

    if (!baseContainers[ROOT_CONTAINER_ID]) {
      baseContainers[ROOT_CONTAINER_ID] = [];
    }

    setContainers(baseContainers);

    const previousOutline = outline;
    const rebuilt = rebuildTreeFromContainers(baseContainers, nodesMap);

    const updates: OutlineReorderUpdate[] = [];
    Object.entries(baseContainers).forEach(([containerId, itemIds]) => {
      const parentId = containerId === ROOT_CONTAINER_ID ? null : containerId;
      itemIds.forEach((nodeId, index) => {
        updates.push({ nodeId, parentId, order: index });
      });
    });

    queryClient.setQueryData(['outline', projectId], rebuilt);
    reorderMutation.mutate(updates, {
      context: { previous: previousOutline },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outline', projectId] }),
    });

    setActiveId(null);
  };

  const handleNodeChange = (nodeId: string, payload: OutlineNodeUpsertPayload) => {
    upsertMutation.mutate(payload);
  };

  const handleAddChild = (parentId: string) => {
    upsertMutation.mutate({ parentId, title: '新节点', summary: '' }, {
      onSuccess: (data) => {
        if (!data?.node) {
          return;
        }
        queryClient.setQueryData<OutlineNode[]>(['outline', projectId], (current) => {
          if (!current) {
            return current;
          }
          const adjusted = insertNode(current, parentId, { ...data.node, children: [] });
          return adjusted;
        });
        onSelectNode(data.node.nodeId);
      },
    });
  };

  const handleAddRoot = () => {
    upsertMutation.mutate({ parentId: null, title: '新节点', summary: '' }, {
      onSuccess: (data) => {
        if (!data?.node) {
          return;
        }
        queryClient.setQueryData<OutlineNode[]>(['outline', projectId], (current) => {
          const next = current ? [...current, { ...data.node, children: [] }] : [{ ...data.node, children: [] }];
          return next.map((node, index) => ({ ...node, order: index, parentId: null }));
        });
        onSelectNode(data.node.nodeId);
      },
    });
  };

  const handleDelete = (nodeId: string) => {
    deleteMutation.mutate(nodeId);
  };

  const handleGenerate = () => {
    if (!chapterCount || chapterCount < 3) {
      toast({ title: '参数错误', description: '请设置至少 3 个章节。', variant: 'error' });
      return;
    }
    const payload: OutlineGenerationPayload = {
      actStructure: structure,
      chapterCount,
      targetChapterLength: targetLength > 0 ? targetLength : undefined,
      styleStrength,
    };
    generateMutation.mutate(payload);
  };

  const isLoading = outlineQuery.isLoading;
  const isGenerating = generateMutation.isPending;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">项目大纲</h2>
          {isLoading ? <span className="text-xs text-slate-500">加载中…</span> : null}
        </div>
        <div className="mt-4 grid gap-3 text-xs text-slate-300 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-400">幕结构</span>
            <select
              value={structure}
              onChange={(event) => setStructure(event.target.value as 'three_act' | 'five_act')}
              className="rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
            >
              <option value="three_act">三幕结构</option>
              <option value="five_act">五幕结构</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-400">章节数量</span>
            <input
              type="number"
              min={3}
              max={120}
              value={chapterCount}
              onChange={(event) => setChapterCount(Number(event.target.value) || 0)}
              className="rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-400">单章目标长度（字）</span>
            <input
              type="number"
              min={300}
              max={8000}
              value={targetLength}
              onChange={(event) => setTargetLength(Number(event.target.value) || 0)}
              className="rounded-lg border border-slate-700/60 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-400">风格强度</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(styleStrength * 100)}
              onChange={(event) => setStyleStrength(Number(event.target.value) / 100)}
              className="accent-brand"
            />
            <span className="text-xs text-slate-400">{Math.round(styleStrength * 100)}%</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-glow transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
          >
            {isGenerating ? '生成中…' : 'AI 生成大纲'}
          </button>
          <button
            type="button"
            onClick={handleAddRoot}
            className="inline-flex items-center justify-center rounded-full border border-slate-700/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-brand/50 hover:text-brand"
          >
            添加根节点
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 shadow-lg">
        {outline.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
            {isLoading ? '正在加载大纲…' : '尚未创建大纲，可使用上方按钮一键生成。'}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <OutlineTree
              nodes={outline}
              parentId={null}
              depth={0}
              selectedNodeId={selectedNodeId}
              onSelect={onSelectNode}
              onChange={handleNodeChange}
              onAddChild={handleAddChild}
              onDelete={handleDelete}
            />
          </DndContext>
        )}
      </section>
    </div>
  );
};

export default OutlinePanel;

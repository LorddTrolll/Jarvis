export type MemoryKind = 'document' | 'question' | 'answer' | 'search' | 'conversation' | 'project' | 'topic' | 'image' | 'video' | 'note'
export interface MemoryNode { id: string; kind: MemoryKind; title: string; excerpt: string; created_at: string; source_id: number | null; meta: { format?: string; sources?: { title?: string; url?: string; node_id?: string }[]; derived?: boolean } }
export interface MemoryEdge { source: string; target: string; weight: number; relation: string; reason: string }
export interface MemoryGraph { nodes: MemoryNode[]; edges: MemoryEdge[]; total: number; revision: number; categories: Partial<Record<MemoryKind, number>>; next_offset: number | null; embedding_method: string }
export interface MemoryDetail extends MemoryNode { content: string; related: (MemoryNode & { reason: string; relation: string; weight: number })[]; original_url: string | null; mime: string | null }
export interface NeuralGestureConfig { pinch_threshold: number; double_ms: number; hold_ms: number; reverse_amplitude: number; reverse_ms: number }
export interface NeuralView { level: 'global' | 'cluster' | 'file'; selected: string | null; parent: string | null; camera?: [number, number, number] | null; target?: [number, number, number] | null; global_camera?: [number, number, number] | null; global_target?: [number, number, number] | null; cluster_camera?: [number, number, number] | null; cluster_target?: [number, number, number] | null }
export interface NeuralPreferences { auto_save: boolean; gesture: NeuralGestureConfig; view: NeuralView }
export interface NeuralSearchResult extends MemoryNode { score: number; method: string }
export interface NeuralCommand { id: number; action: string; query?: string }
export const CATEGORIES: { id: MemoryKind; label: string; color: string }[] = [
  { id: 'document', label: 'Documentos', color: '#4edbe4' }, { id: 'question', label: 'Perguntas', color: '#709eff' },
  { id: 'answer', label: 'Respostas', color: '#b197ff' }, { id: 'search', label: 'Pesquisas', color: '#f0c56b' },
  { id: 'conversation', label: 'Conversas', color: '#62ddb0' }, { id: 'project', label: 'Projetos', color: '#f29cba' },
  { id: 'topic', label: 'Assuntos', color: '#d7f6ff' }, { id: 'image', label: 'Imagens', color: '#f6a36c' },
  { id: 'video', label: 'Vídeos', color: '#efbc88' }, { id: 'note', label: 'Notas', color: '#65cbd4' },
]
export const DEFAULT_NEURAL_GESTURE: NeuralGestureConfig = { pinch_threshold: .28, double_ms: 450, hold_ms: 600, reverse_amplitude: .75, reverse_ms: 220 }

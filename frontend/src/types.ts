export type Panel = 'dashboard' | 'neural' | 'education' | 'chat' | 'vision' | 'tasks' | 'search' | 'files' | 'integrations' | 'settings'
export interface Status { ai_configured: boolean; ai_model: string; search_configured: boolean; telegram_configured: boolean; storage: string; history_days: number; password_enabled: boolean }
export interface Message { id: number; role: 'user' | 'assistant'; content: string; created_at?: string }
export interface Task { id: number; title: string; done: boolean; priority: string; due_at: string | null }
export interface DocumentItem { id: number; name: string; characters: number }
export interface Source { title: string; url: string; description: string; age?: string }
export interface FileResult { document_id: number; name: string; excerpt: string; offset: number }
export interface Draft { id: number; platform: string; recipient: string; text: string; state: string; external_id?: string }
export interface Integration { id: string; name: string; configured: boolean; capabilities: string[]; mode: string }
export interface Audit { id: number; action: string; detail: string; created_at: string }
export interface StreamEvent { type: 'delta' | 'error' | 'done' | 'tool'; text?: string; name?: string; result?: unknown }

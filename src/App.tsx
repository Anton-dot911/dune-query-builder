import { useState, useMemo, useRef } from 'react'
import { CATEGORIES, ALL_QUERIES, type Query } from './data/queries'
import './styles/globals.css'

const LS_KEY = 'dune-saved-queries'
function loadSaved(): Query[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
function saveToDB(queries: Query[]) { localStorage.setItem(LS_KEY, JSON.stringify(queries)) }

interface QueryResult {
  rows:      Record<string, unknown>[]
  columns:   string[]
  row_count: number
  exec_ms:   number
  query_id:  string
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
  const s = String(v)
  // shorten long hex addresses
  if (/^0x[a-fA-F0-9]{30,}/.test(s)) return s.slice(0, 8) + '…' + s.slice(-6)
  return s.length > 50 ? s.slice(0, 48) + '…' : s
}

function exportCSV(result: QueryResult) {
  const header = result.columns.join(',')
  const rows   = result.rows.map(r => result.columns.map(c => JSON.stringify(r[c] ?? '')).join(','))
  const blob   = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href = url; a.download = `dune-query-${result.query_id}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  // ── Core state ─────────────────────────────
  const [activeId, setActiveId]     = useState(CATEGORIES[0].queries[0].id)
  const [sql, setSql]               = useState(CATEGORIES[0].queries[0].sql)
  const [search, setSearch]         = useState('')
  const [saved, setSaved]           = useState<Query[]>(loadSaved)
  const [toast, setToast]           = useState('')
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveName, setSaveName]     = useState('')
  const [view, setView]             = useState<'sql' | 'results'>('sql')

  // ── AI state ───────────────────────────────
  const [aiOpen, setAiOpen]     = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState('')
  const [aiExplain, setAiExplain] = useState('')

  // ── Run Query state ────────────────────────
  const [runOpen, setRunOpen]       = useState(false)
  const [queryId, setQueryId]       = useState('')
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError]     = useState('')
  const [runProgress, setRunProgress] = useState(0)
  const [result, setResult]         = useState<QueryResult | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiInputRef  = useRef<HTMLTextAreaElement>(null)
  const queryIdRef  = useRef<HTMLInputElement>(null)

  const currentMeta = useMemo(() =>
    ALL_QUERIES.find(q => q.id === activeId) || saved.find(q => q.id === activeId) || null
  , [activeId, saved])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2400) }

  function selectQuery(q: Query) {
    setActiveId(q.id); setSql(q.sql); setAiExplain('')
    setView('sql'); textareaRef.current?.focus()
  }

  async function copySQL() {
    try { await navigator.clipboard.writeText(sql.trim()); showToast('✓ SQL скопійовано') }
    catch { showToast('⚠ Виділи текст вручну') }
  }

  async function openDune() {
    await navigator.clipboard.writeText(sql.trim()).catch(() => {})
    window.open('https://dune.com/queries/new', '_blank')
    showToast('✓ SQL скопійовано — встав у Dune Editor')
  }

  function confirmSave() {
    if (!saveName.trim()) return
    const q: Query = { id: 'saved-' + Date.now(), title: saveName.trim(), description: 'Збережений запит', sql, tags: ['saved'] }
    const updated = [q, ...saved.filter(x => x.title !== saveName.trim())]
    setSaved(updated); saveToDB(updated); setSaveDialog(false); setActiveId(q.id)
    showToast('✓ Запит збережено')
  }

  function deleteSaved(id: string) {
    const updated = saved.filter(q => q.id !== id); setSaved(updated); saveToDB(updated)
  }

  // ── AI generate ────────────────────────────
  function toggleAI() {
    const next = !aiOpen; setAiOpen(next); setAiError('')
    if (next) { setRunOpen(false); setTimeout(() => aiInputRef.current?.focus(), 80) }
  }

  async function generateSQL() {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true); setAiError('')
    try {
      const res  = await fetch('/.netlify/functions/sql-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSql(data.sql); setAiExplain(data.explanation || '')
      setActiveId(''); setAiOpen(false); setAiPrompt('')
      setView('sql'); showToast('✨ SQL згенеровано')
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Помилка генерації')
    } finally { setAiLoading(false) }
  }

  // ── Run query ──────────────────────────────
  function toggleRun() {
    const next = !runOpen; setRunOpen(next); setRunError('')
    if (next) { setAiOpen(false); setTimeout(() => queryIdRef.current?.focus(), 80) }
  }

  async function executeQuery() {
    if (!queryId.trim() || runLoading) return
    setRunLoading(true); setRunError(''); setResult(null); setRunProgress(0)

    // Animate progress bar during polling
    const timer = setInterval(() => setRunProgress(p => Math.min(p + 8, 90)), 4000)

    try {
      const res  = await fetch('/.netlify/functions/dune-query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_id: queryId.trim() })
      })
      const data = await res.json()

      if (data.status === 'no_api_key') throw new Error(data.hint || data.message)
      if (data.status === 'timeout')    throw new Error(data.message)
      if (data.error)                   throw new Error(data.error)

      setRunProgress(100)
      setResult({ rows: data.rows, columns: data.columns, row_count: data.row_count, exec_ms: data.exec_ms, query_id: queryId.trim() })
      setRunOpen(false)
      setView('results')
      showToast(`✓ ${data.row_count} рядків отримано`)
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Помилка виконання')
    } finally {
      clearInterval(timer); setRunLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return ALL_QUERIES.filter(i => i.title.toLowerCase().includes(q) || i.tags.some(t => t.includes(q)))
  }, [search])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget, s = ta.selectionStart, end = ta.selectionEnd
      const next = sql.substring(0, s) + '  ' + sql.substring(end)
      setSql(next); setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
    }
  }

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">⛓️</div>
          <div>
            <h1>Dune Query Builder</h1>
            <p>Blockchain Analytics · AI SQL · Open in Dune</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-sm btn-header-ghost" onClick={copySQL}>📋</button>
          <button className="btn btn-sm btn-header-ghost" onClick={openDune}>↗ Dune</button>
        </div>
      </header>

      {/* ── AI Panel ── */}
      {aiOpen && (
        <div className="ai-panel">
          <div className="ai-panel-inner">
            <div className="ai-label">✨ AI SQL Generator — опиши що хочеш проаналізувати</div>
            <div className="ai-input-row">
              <textarea ref={aiInputRef} className="ai-input" value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)} rows={2} disabled={aiLoading}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateSQL() } }}
                placeholder="Наприклад: топ 20 трейдерів Aerodrome за 30 днів, об'єм > $1000, без ботів..." />
              <button className="btn ai-send-btn" onClick={generateSQL} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? <span className="ai-spinner" /> : '→'}
              </button>
            </div>
            {aiError && <div className="ai-error">{aiError}</div>}
            <div className="ai-hint">Enter — генерувати · Shift+Enter — новий рядок · Потрібен ANTHROPIC_API_KEY в Netlify</div>
          </div>
        </div>
      )}

      {/* ── Run Query Panel ── */}
      {runOpen && (
        <div className="run-panel">
          <div className="run-panel-inner">
            <div className="run-label">▶ Виконати Dune Query</div>
            <div className="ai-input-row">
              <input ref={queryIdRef} className="run-input" type="text"
                value={queryId} onChange={e => setQueryId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && executeQuery()}
                placeholder="Dune Query ID — наприклад: 3456789" disabled={runLoading} />
              <button className="btn run-send-btn" onClick={executeQuery} disabled={runLoading || !queryId.trim()}>
                {runLoading ? <span className="run-spinner" /> : '▶'}
              </button>
            </div>
            {runLoading && (
              <div className="run-progress-wrap">
                <div className="run-progress-bar" style={{ width: `${runProgress}%` }} />
                <span className="run-progress-label">Виконується запит…</span>
              </div>
            )}
            {runError && <div className="run-error">{runError}</div>}
            <div className="ai-hint">
              Знайдіть Query ID на dune.com/queries → URL: dune.com/queries/<strong>3456789</strong> · Потрібен DUNE_API_KEY
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div className="main">

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-search">
            <input type="text" placeholder="🔍 Пошук запитів..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="sidebar-scroll">
            {filtered && (
              <div>
                <div className="cat-header">🔍 Результати ({filtered.length})</div>
                {filtered.map(q => (
                  <button key={q.id} className={`query-item ${activeId === q.id ? 'active' : ''}`}
                    onClick={() => { selectQuery(q); setSearch('') }}>{q.title}</button>
                ))}
              </div>
            )}
            {!filtered && CATEGORIES.map(cat => (
              <div key={cat.id}>
                <div className="cat-header">{cat.icon} {cat.label}</div>
                {cat.queries.map(q => (
                  <button key={q.id} className={`query-item ${activeId === q.id ? 'active' : ''}`} onClick={() => selectQuery(q)}>{q.title}</button>
                ))}
              </div>
            ))}
            {!filtered && saved.length > 0 && (
              <div className="saved-section">
                <div className="cat-header">💾 Збережені</div>
                {saved.map(q => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <button className={`query-item ${activeId === q.id ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => selectQuery(q)}>{q.title}</button>
                    <button onClick={() => deleteSaved(q.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 10px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Editor area */}
        <div className="editor-area">

          {/* Meta + view tabs */}
          <div className="editor-meta">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {aiExplain
                  ? <><h2 style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>✨ AI Generated</h2><p>{aiExplain}</p></>
                  : currentMeta
                    ? <><h2>{currentMeta.title}</h2><p>{currentMeta.description}</p>
                        <div className="editor-tags">{currentMeta.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>
                      </>
                    : <h2 style={{ color: 'var(--text-dim)' }}>Кастомний запит</h2>
                }
              </div>
              {/* View switcher — only when results exist */}
              {result && (
                <div className="view-tabs">
                  <button className={`view-tab ${view === 'sql' ? 'active' : ''}`} onClick={() => setView('sql')}>SQL</button>
                  <button className={`view-tab ${view === 'results' ? 'active' : ''}`} onClick={() => setView('results')}>
                    Результати <span className="row-badge">{result.row_count}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SQL editor */}
          {view === 'sql' && (
            <div className="sql-wrapper">
              <div className="sql-gutter" aria-hidden="true">
                {Array.from({ length: sql.split('\n').length }, (_, i) => <span key={i}>{i + 1}</span>)}
              </div>
              <textarea ref={textareaRef} className="sql-textarea" value={sql}
                onChange={e => { setSql(e.target.value); setAiExplain('') }}
                onKeyDown={onKeyDown} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                placeholder="-- Обери запит зліва або згенеруй через ✨ AI" />
            </div>
          )}

          {/* Results table */}
          {view === 'results' && result && (
            <div className="results-area">
              <div className="results-meta">
                <span>{result.row_count} рядків</span>
                <span>·</span>
                <span>{(result.exec_ms / 1000).toFixed(1)}с виконання</span>
                <span>·</span>
                <span>Query #{result.query_id}</span>
                <button className="btn btn-ghost btn-sm results-export" onClick={() => exportCSV(result)}>⬇ CSV</button>
              </div>
              <div className="results-table-wrap">
                <table className="results-table">
                  <thead>
                    <tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map(c => <td key={c} title={String(row[c] ?? '')}>{formatCell(row[c])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="action-bar">
            <button className={`btn ai-toggle-btn ${aiOpen ? 'ai-toggle-active' : ''}`} onClick={toggleAI}>
              ✨ {aiOpen ? 'Закрити AI' : 'AI Generate'}
            </button>
            <button className={`btn run-toggle-btn ${runOpen ? 'run-toggle-active' : ''}`} onClick={toggleRun}>
              ▶ {runOpen ? 'Закрити' : 'Run Query'}
            </button>
            <div className="action-divider" />
            <button className="btn btn-ghost" onClick={copySQL}>📋</button>
            <button className="btn btn-ghost" onClick={openDune}>↗ Dune</button>
            <button className="btn btn-ghost" onClick={() => { setSaveName(currentMeta?.title || 'Мій запит'); setSaveDialog(true) }}>💾</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSql('-- Новий запит\nSELECT\n\nFROM\n\nWHERE\n\nLIMIT 100'); setActiveId(''); setAiExplain(''); setResult(null); setView('sql') }}>+ Новий</button>
            <div className="action-info">{sql.split('\n').length} рядків</div>
          </div>
        </div>
      </div>

      {/* Save dialog */}
      {saveDialog && (
        <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && setSaveDialog(false)}>
          <div className="dialog">
            <h3>💾 Зберегти запит</h3>
            <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmSave()} placeholder="Назва запиту..." autoFocus />
            <div className="dialog-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setSaveDialog(false)}>Скасувати</button>
              <button className="btn btn-sm" onClick={confirmSave}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

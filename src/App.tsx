import { useState, useMemo, useRef, useEffect } from 'react'
import { CATEGORIES, ALL_QUERIES, type Query } from './data/queries'
import './styles/globals.css'

const LS_KEY = 'dune-saved-queries'
function loadSaved(): Query[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
function saveToDB(q: Query[]) { localStorage.setItem(LS_KEY, JSON.stringify(q)) }

type MobileTab = 'library' | 'sql' | 'ai' | 'run'

interface QueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  row_count: number
  exec_ms: number
  query_id: string
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
  const s = String(v)
  if (/^0x[a-fA-F0-9]{30,}/.test(s)) return s.slice(0, 8) + '…' + s.slice(-6)
  return s.length > 50 ? s.slice(0, 48) + '…' : s
}

function exportCSV(r: QueryResult) {
  const csv = [r.columns.join(','), ...r.rows.map(row => r.columns.map(c => JSON.stringify(row[c] ?? '')).join(','))].join('\n')
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `dune-${r.query_id}.csv` })
  a.click()
}

export default function App() {
  const [activeId, setActiveId]       = useState(CATEGORIES[0].queries[0].id)
  const [sql, setSql]                 = useState(CATEGORIES[0].queries[0].sql)
  const [search, setSearch]           = useState('')
  const [saved, setSaved]             = useState<Query[]>(loadSaved)
  const [toast, setToast]             = useState('')
  const [saveDialog, setSaveDialog]   = useState(false)
  const [saveName, setSaveName]       = useState('')
  const [view, setView]               = useState<'sql' | 'results'>('sql')
  const [mobileTab, setMobileTab]     = useState<MobileTab>('sql')

  const [aiPrompt, setAiPrompt]       = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiError, setAiError]         = useState('')
  const [aiExplain, setAiExplain]     = useState('')

  const [queryId, setQueryId]         = useState('')
  const [runLoading, setRunLoading]   = useState(false)
  const [runError, setRunError]       = useState('')
  const [runProgress, setRunProgress] = useState(0)
  const [result, setResult]           = useState<QueryResult | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiInputRef  = useRef<HTMLTextAreaElement>(null)
  const queryIdRef  = useRef<HTMLInputElement>(null)

  // Focus AI/Run inputs when switching mobile tabs
  useEffect(() => {
    if (mobileTab === 'ai')  setTimeout(() => aiInputRef.current?.focus(), 80)
    if (mobileTab === 'run') setTimeout(() => queryIdRef.current?.focus(), 80)
  }, [mobileTab])

  const currentMeta = useMemo(() =>
    ALL_QUERIES.find(q => q.id === activeId) || saved.find(q => q.id === activeId) || null
  , [activeId, saved])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2400) }

  function selectQuery(q: Query) {
    setActiveId(q.id); setSql(q.sql); setAiExplain('')
    setView('sql'); setMobileTab('sql')
    textareaRef.current?.focus()
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
      setActiveId(''); setAiPrompt(''); setView('sql'); setMobileTab('sql')
      showToast('✨ SQL згенеровано')
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Помилка генерації')
    } finally { setAiLoading(false) }
  }

  async function executeQuery() {
    if (!queryId.trim() || runLoading) return
    setRunLoading(true); setRunError(''); setResult(null); setRunProgress(0)
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
      setView('results'); setMobileTab('run')
      showToast(`✓ ${data.row_count} рядків отримано`)
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Помилка виконання')
    } finally { clearInterval(timer); setRunLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return ALL_QUERIES.filter(i => i.title.toLowerCase().includes(q) || i.tags.some(t => t.includes(q)))
  }, [search])

  function onSqlKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget, s = ta.selectionStart, end = ta.selectionEnd
      const next = sql.substring(0, s) + '  ' + sql.substring(end)
      setSql(next); setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
    }
  }

  // ── Sidebar content (shared between desktop sidebar + mobile library tab)
  const SidebarContent = () => (
    <>
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
            {!filtered.length && <div style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Нічого не знайдено</div>}
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
                <button onClick={() => { const u = saved.filter(x => x.id !== q.id); setSaved(u); saveToDB(u) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 14px', fontSize: '1rem' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  // ── AI panel content
  const AIPanel = () => (
    <div className="mobile-panel-content">
      <div className="panel-heading">✨ AI SQL Generator</div>
      <p className="panel-desc">Опиши що хочеш проаналізувати — Claude згенерує правильний DuneSQL</p>
      <textarea ref={aiInputRef} className="ai-input mobile-ai-input" value={aiPrompt}
        onChange={e => setAiPrompt(e.target.value)} rows={4} disabled={aiLoading}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateSQL() } }}
        placeholder="Наприклад: топ 20 трейдерів Aerodrome на Base за 30 днів, виключити боти, відсортувати за об'ємом..." />
      <button className="btn mobile-generate-btn" onClick={generateSQL} disabled={aiLoading || !aiPrompt.trim()}>
        {aiLoading ? <><span className="ai-spinner" style={{ marginRight: 8 }} />Генерую SQL…</> : '✨ Згенерувати SQL'}
      </button>
      {aiError && <div className="ai-error">{aiError}</div>}
      <div className="ai-hint" style={{ marginTop: 8 }}>Потрібен ANTHROPIC_API_KEY в Netlify → Environment variables</div>
    </div>
  )

  // ── Run panel content
  const RunPanel = () => (
    <div className="mobile-panel-content">
      <div className="panel-heading">▶ Виконати Dune Query</div>
      <p className="panel-desc">Введи Query ID з dune.com — результати з'являться у таблиці нижче</p>
      <input ref={queryIdRef} className="run-input" type="text" inputMode="numeric"
        value={queryId} onChange={e => setQueryId(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && executeQuery()}
        placeholder="Query ID — наприклад: 3456789" disabled={runLoading} />
      <p className="ai-hint" style={{ margin: '6px 0 12px' }}>dune.com/queries/<strong>3456789</strong> ← це і є Query ID</p>
      <button className="btn mobile-run-btn" onClick={executeQuery} disabled={runLoading || !queryId.trim()}>
        {runLoading ? <><span className="run-spinner" style={{ marginRight: 8 }} />Виконую запит…</> : '▶ Виконати'}
      </button>
      {runLoading && (
        <div className="run-progress-wrap" style={{ marginTop: 12 }}>
          <div className="run-progress-bar" style={{ width: `${runProgress}%` }} />
          <span className="run-progress-label">Очікую результати Dune…</span>
        </div>
      )}
      {runError && <div className="run-error" style={{ marginTop: 10 }}>{runError}</div>}

      {/* Results table inside Run tab on mobile */}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="results-meta" style={{ borderRadius: 'var(--r) var(--r) 0 0' }}>
            <span>{result.row_count} рядків</span>
            <span>·</span>
            <span>{(result.exec_ms / 1000).toFixed(1)}с</span>
            <button className="btn btn-ghost btn-sm results-export" onClick={() => exportCSV(result)}>⬇ CSV</button>
          </div>
          <div className="results-table-wrap" style={{ maxHeight: '40vh', borderRadius: '0 0 var(--r) var(--r)', border: '1px solid var(--border)', borderTop: 'none' }}>
            <table className="results-table">
              <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, i) => (
                <tr key={i}>{result.columns.map(c => <td key={c} title={String(row[c] ?? '')}>{formatCell(row[c])}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">⛓️</div>
          <div>
            <h1>Dune Query Builder</h1>
            <p className="logo-sub">Blockchain Analytics · AI SQL</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-sm btn-header-ghost" onClick={copySQL} title="Копіювати SQL">📋</button>
          <button className="btn btn-sm btn-header-ghost" onClick={openDune} title="Відкрити в Dune">↗</button>
        </div>
      </header>

      {/* ── Desktop layout ── */}
      <div className="main desktop-only">
        <aside className="sidebar"><SidebarContent /></aside>

        <div className="editor-area">
          <div className="editor-meta">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {aiExplain
                  ? <><h2 style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>✨ AI Generated</h2><p>{aiExplain}</p></>
                  : currentMeta
                    ? <><h2>{currentMeta.title}</h2><p>{currentMeta.description}</p>
                        <div className="editor-tags">{currentMeta.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>
                      </>
                    : <h2 style={{ color: 'var(--text-dim)' }}>Кастомний запит</h2>
                }
              </div>
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

          {view === 'sql' && (
            <div className="sql-wrapper">
              <div className="sql-gutter" aria-hidden="true">
                {Array.from({ length: sql.split('\n').length }, (_, i) => <span key={i}>{i + 1}</span>)}
              </div>
              <textarea ref={textareaRef} className="sql-textarea" value={sql}
                onChange={e => { setSql(e.target.value); setAiExplain('') }}
                onKeyDown={onSqlKeyDown} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                placeholder="-- Обери запит зліва або згенеруй через ✨ AI" />
            </div>
          )}

          {view === 'results' && result && (
            <div className="results-area">
              <div className="results-meta">
                <span>{result.row_count} рядків</span><span>·</span>
                <span>{(result.exec_ms / 1000).toFixed(1)}с</span><span>·</span>
                <span>Query #{result.query_id}</span>
                <button className="btn btn-ghost btn-sm results-export" onClick={() => exportCSV(result)}>⬇ CSV</button>
              </div>
              <div className="results-table-wrap">
                <table className="results-table">
                  <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{result.rows.map((row, i) => (
                    <tr key={i}>{result.columns.map(c => <td key={c} title={String(row[c] ?? '')}>{formatCell(row[c])}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="action-bar">
            <button className="btn ai-toggle-btn" onClick={() => { setView('sql') }}>✨ AI Generate ↑</button>
            <button className="btn run-toggle-btn" onClick={() => {}}>▶ Run Query ↑</button>
            <div className="action-divider" />
            <button className="btn btn-ghost" onClick={copySQL}>📋 Копіювати</button>
            <button className="btn btn-ghost" onClick={openDune}>↗ Dune</button>
            <button className="btn btn-ghost" onClick={() => { setSaveName(currentMeta?.title || 'Мій запит'); setSaveDialog(true) }}>💾</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSql('SELECT\n\nFROM\n\nWHERE\n\nLIMIT 100'); setActiveId(''); setAiExplain(''); setResult(null); setView('sql') }}>+ Новий</button>
            <div className="action-info">{sql.split('\n').length} рядків</div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="mobile-only">

        {/* Mobile content panels */}
        <div className="mobile-content">
          {mobileTab === 'library' && (
            <div className="mobile-panel sidebar-panel"><SidebarContent /></div>
          )}
          {mobileTab === 'sql' && (
            <div className="mobile-panel sql-panel">
              <div className="mobile-sql-meta">
                {aiExplain
                  ? <span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 }}>✨ AI Generated</span>
                  : <span className="mobile-query-title">{currentMeta?.title || 'Кастомний запит'}</span>
                }
              </div>
              <div className="sql-wrapper" style={{ flex: 1 }}>
                <div className="sql-gutter" aria-hidden="true">
                  {Array.from({ length: sql.split('\n').length }, (_, i) => <span key={i}>{i + 1}</span>)}
                </div>
                <textarea ref={textareaRef} className="sql-textarea" value={sql}
                  onChange={e => { setSql(e.target.value); setAiExplain('') }}
                  onKeyDown={onSqlKeyDown} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                  placeholder="-- Обери запит з 📚 або згенеруй через ✨" />
              </div>
              <div className="mobile-action-bar">
                <button className="btn mobile-action-btn" onClick={copySQL}>📋 Copy</button>
                <button className="btn mobile-action-btn" onClick={openDune}>↗ Dune</button>
                <button className="btn btn-ghost mobile-action-btn" onClick={() => { setSaveName(currentMeta?.title || 'Мій запит'); setSaveDialog(true) }}>💾 Save</button>
              </div>
            </div>
          )}
          {mobileTab === 'ai' && <div className="mobile-panel"><AIPanel /></div>}
          {mobileTab === 'run' && <div className="mobile-panel"><RunPanel /></div>}
        </div>

        {/* Mobile bottom nav */}
        <nav className="mobile-nav">
          {([
            { id: 'library', icon: '📚', label: 'Запити' },
            { id: 'sql',     icon: '✍️',  label: 'SQL' },
            { id: 'ai',      icon: '✨',  label: 'AI' },
            { id: 'run',     icon: '▶',   label: result ? `${result.row_count}р` : 'Run' },
          ] as { id: MobileTab; icon: string; label: string }[]).map(tab => (
            <button key={tab.id}
              className={`mobile-nav-btn ${mobileTab === tab.id ? 'active' : ''} ${tab.id === 'run' && result ? 'has-results' : ''}`}
              onClick={() => setMobileTab(tab.id)}>
              <span className="mobile-nav-icon">{tab.icon}</span>
              <span className="mobile-nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>
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

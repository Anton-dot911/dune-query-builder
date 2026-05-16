import { useState, useMemo, useRef } from 'react'
import { CATEGORIES, ALL_QUERIES, type Query } from './data/queries'
import './styles/globals.css'

const LS_KEY = 'dune-saved-queries'
function loadSaved(): Query[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
function saveToDB(queries: Query[]) { localStorage.setItem(LS_KEY, JSON.stringify(queries)) }

export default function App() {
  const [activeId, setActiveId]     = useState(CATEGORIES[0].queries[0].id)
  const [sql, setSql]               = useState(CATEGORIES[0].queries[0].sql)
  const [search, setSearch]         = useState('')
  const [saved, setSaved]           = useState<Query[]>(loadSaved)
  const [toast, setToast]           = useState('')
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveName, setSaveName]     = useState('')
  const [aiOpen, setAiOpen]         = useState(false)
  const [aiPrompt, setAiPrompt]     = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [aiError, setAiError]       = useState('')
  const [aiExplain, setAiExplain]   = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const aiInputRef  = useRef<HTMLTextAreaElement>(null)

  const currentMeta = useMemo(() =>
    ALL_QUERIES.find(q => q.id === activeId) || saved.find(q => q.id === activeId) || null
  , [activeId, saved])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2400) }

  function selectQuery(q: Query) {
    setActiveId(q.id); setSql(q.sql); setAiExplain(''); textareaRef.current?.focus()
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

  function toggleAI() {
    const next = !aiOpen
    setAiOpen(next); setAiError('')
    if (next) setTimeout(() => aiInputRef.current?.focus(), 80)
  }

  async function generateSQL() {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true); setAiError('')
    try {
      const res = await fetch('/.netlify/functions/sql-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSql(data.sql); setAiExplain(data.explanation || '')
      setActiveId(''); setAiOpen(false); setAiPrompt('')
      showToast('✨ SQL згенеровано'); textareaRef.current?.focus()
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Помилка генерації')
    } finally { setAiLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return ALL_QUERIES.filter(item =>
      item.title.toLowerCase().includes(q) || item.tags.some(t => t.includes(q))
    )
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

      {/* ── Header — compact, gradient ── */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">⛓️</div>
          <div>
            <h1>Dune Query Builder</h1>
            <p>Blockchain Analytics · AI SQL · Open in Dune</p>
          </div>
        </div>
        {/* Header: only copy + dune on mobile */}
        <div className="header-actions">
          <button className="btn btn-sm btn-header-ghost" onClick={copySQL}>📋</button>
          <button className="btn btn-sm btn-header-ghost" onClick={openDune}>↗ Dune</button>
        </div>
      </header>

      {/* ── AI Panel — slides in below header ── */}
      {aiOpen && (
        <div className="ai-panel">
          <div className="ai-panel-inner">
            <div className="ai-label">✨ AI SQL Generator — опиши що хочеш проаналізувати</div>
            <div className="ai-input-row">
              <textarea
                ref={aiInputRef}
                className="ai-input"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateSQL() } }}
                placeholder="Наприклад: топ 20 трейдерів Aerodrome за 30 днів, об'єм більше $1000, виключити боти..."
                rows={2}
                disabled={aiLoading}
              />
              <button className="btn ai-send-btn" onClick={generateSQL} disabled={aiLoading || !aiPrompt.trim()}>
                {aiLoading ? <span className="ai-spinner" /> : '→'}
              </button>
            </div>
            {aiError && <div className="ai-error">{aiError}</div>}
            <div className="ai-hint">Enter — генерувати · Shift+Enter — новий рядок · Потрібен ANTHROPIC_API_KEY в Netlify</div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
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
                {!filtered.length && <div style={{ padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Нічого не знайдено</div>}
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
                    <button onClick={() => deleteSaved(q.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 10px', fontSize: '0.8rem' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Editor */}
        <div className="editor-area">
          <div className="editor-meta">
            {aiExplain ? (
              <><h2 style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>✨ AI Generated</h2><p>{aiExplain}</p></>
            ) : currentMeta ? (
              <><h2>{currentMeta.title}</h2><p>{currentMeta.description}</p>
                <div className="editor-tags">{currentMeta.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>
              </>
            ) : (
              <h2 style={{ color: 'var(--text-dim)' }}>Кастомний запит</h2>
            )}
          </div>

          <div className="sql-wrapper">
            <div className="sql-gutter" aria-hidden="true">
              {Array.from({ length: sql.split('\n').length }, (_, i) => <span key={i}>{i + 1}</span>)}
            </div>
            <textarea ref={textareaRef} className="sql-textarea" value={sql}
              onChange={e => { setSql(e.target.value); setAiExplain('') }}
              onKeyDown={onKeyDown} spellCheck={false} autoCapitalize="none" autoCorrect="off"
              placeholder="-- Обери запит зліва або згенеруй через ✨ AI" />
          </div>

          {/* ── Action bar — AI Generate тут, завжди видно ── */}
          <div className="action-bar">
            <button
              className={`btn ai-toggle-btn ${aiOpen ? 'ai-toggle-active' : ''}`}
              onClick={toggleAI}
            >
              ✨ {aiOpen ? 'Закрити AI' : 'AI Generate'}
            </button>
            <div className="action-divider" />
            <button className="btn" onClick={copySQL}>📋 Копіювати</button>
            <button className="btn" onClick={openDune}>↗ Dune</button>
            <button className="btn btn-ghost" onClick={() => { setSaveName(currentMeta?.title || 'Мій запит'); setSaveDialog(true) }}>💾</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSql('-- Новий запит\nSELECT\n\nFROM\n\nWHERE\n\nLIMIT 100'); setActiveId(''); setAiExplain('') }}>+ Новий</button>
            <div className="action-info">{sql.split('\n').length} рядків</div>
          </div>
        </div>
      </div>

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

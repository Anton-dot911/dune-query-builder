import { useState, useMemo, useRef, useEffect } from 'react'
import { CATEGORIES, ALL_QUERIES, type Query } from './data/queries'
import './styles/globals.css'

const LS_KEY = 'dune-saved-queries'

function loadSaved(): Query[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') }
  catch { return [] }
}
function saveToDB(queries: Query[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(queries))
}

function lineCount(sql: string) {
  return sql.split('\n').length
}

export default function App() {
  const [activeId, setActiveId]   = useState(CATEGORIES[0].queries[0].id)
  const [sql, setSql]             = useState(CATEGORIES[0].queries[0].sql)
  const [search, setSearch]       = useState('')
  const [saved, setSaved]         = useState<Query[]>(loadSaved)
  const [toast, setToast]         = useState('')
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveName, setSaveName]   = useState('')
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  // Current query meta
  const currentMeta = useMemo(() =>
    ALL_QUERIES.find(q => q.id === activeId) ||
    saved.find(q => q.id === activeId) ||
    null
  , [activeId, saved])

  // Line numbers
  const lines = lineCount(sql)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function selectQuery(q: Query) {
    setActiveId(q.id)
    setSql(q.sql)
    textareaRef.current?.focus()
  }

  async function copySQL() {
    try {
      await navigator.clipboard.writeText(sql.trim())
      showToast('✓ SQL скопійовано в буфер обміну')
    } catch {
      showToast('⚠ Не вдалось скопіювати — виділи текст вручну')
    }
  }

  async function openDune() {
    await navigator.clipboard.writeText(sql.trim()).catch(() => {})
    window.open('https://dune.com/queries/new', '_blank')
    showToast('✓ SQL скопійовано — встав у Dune Editor')
  }

  function openSaveDialog() {
    setSaveName(currentMeta?.title || 'Мій запит')
    setSaveDialog(true)
  }

  function confirmSave() {
    if (!saveName.trim()) return
    const newQuery: Query = {
      id: 'saved-' + Date.now(),
      title: saveName.trim(),
      description: 'Збережений запит',
      sql,
      tags: ['saved']
    }
    const updated = [newQuery, ...saved.filter(q => q.title !== saveName.trim())]
    setSaved(updated)
    saveToDB(updated)
    setSaveDialog(false)
    setActiveId(newQuery.id)
    showToast('✓ Запит збережено')
  }

  function deleteSaved(id: string) {
    const updated = saved.filter(q => q.id !== id)
    setSaved(updated)
    saveToDB(updated)
    showToast('Запит видалено')
  }

  // Filter queries by search
  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return ALL_QUERIES.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.tags.some(t => t.includes(q)) ||
      item.description.toLowerCase().includes(q)
    )
  }, [search])

  // Handle Tab key in textarea
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = sql.substring(0, start) + '  ' + sql.substring(end)
      setSql(next)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2 }, 0)
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">⛓️</div>
          <div>
            <h1>Dune Query Builder</h1>
            <p>Blockchain Analytics · No API required · Open in Dune</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-sm" onClick={copySQL}>📋 Copy SQL</button>
          <button className="btn btn-sm" onClick={openDune}>↗ Open Dune</button>
        </div>
      </header>

      {/* Main */}
      <div className="main">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="🔍 Пошук запитів..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="sidebar-scroll">
            {/* Search results */}
            {filtered && (
              <div>
                <div className="cat-header">🔍 Результати ({filtered.length})</div>
                {filtered.map(q => (
                  <button key={q.id} className={`query-item ${activeId === q.id ? 'active' : ''}`}
                    onClick={() => { selectQuery(q); setSearch('') }}>
                    {q.title}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Нічого не знайдено
                  </div>
                )}
              </div>
            )}

            {/* Categories */}
            {!filtered && CATEGORIES.map(cat => (
              <div key={cat.id}>
                <div className="cat-header">{cat.icon} {cat.label}</div>
                {cat.queries.map(q => (
                  <button key={q.id}
                    className={`query-item ${activeId === q.id ? 'active' : ''}`}
                    onClick={() => selectQuery(q)}
                  >
                    {q.title}
                  </button>
                ))}
              </div>
            ))}

            {/* Saved queries */}
            {!filtered && saved.length > 0 && (
              <div className="saved-section">
                <div className="cat-header">💾 Збережені</div>
                {saved.map(q => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      className={`query-item ${activeId === q.id ? 'active' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() => selectQuery(q)}
                    >
                      {q.title}
                    </button>
                    <button
                      onClick={() => deleteSaved(q.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 8px', fontSize: '0.7rem' }}
                      title="Видалити"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Editor */}
        <div className="editor-area">
          {/* Meta */}
          <div className="editor-meta">
            {currentMeta ? (
              <>
                <h2>{currentMeta.title}</h2>
                <p>{currentMeta.description}</p>
                <div className="editor-tags">
                  {currentMeta.tags.map(t => <span key={t} className="tag">#{t}</span>)}
                </div>
              </>
            ) : (
              <h2 style={{ color: 'var(--text-dim)' }}>Кастомний запит</h2>
            )}
          </div>

          {/* SQL editor with line numbers */}
          <div className="sql-wrapper">
            <div className="sql-gutter" aria-hidden="true">
              {Array.from({ length: lines }, (_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="sql-textarea"
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="-- Напиши або обери SQL запит зліва..."
            />
          </div>

          {/* Action bar */}
          <div className="action-bar">
            <button className="btn" onClick={copySQL}>📋 Копіювати SQL</button>
            <button className="btn" onClick={openDune}>↗ Відкрити в Dune</button>
            <button className="btn btn-ghost" onClick={openSaveDialog}>💾 Зберегти</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSql('-- Новий запит\nSELECT\n\nFROM\n\nWHERE\n\nLIMIT 100'); setActiveId(''); }}>
              + Новий
            </button>
            <div className="action-info">
              {lines} рядків · {sql.length} символів
            </div>
          </div>
        </div>
      </div>

      {/* Save dialog */}
      {saveDialog && (
        <div className="dialog-overlay" onClick={e => e.target === e.currentTarget && setSaveDialog(false)}>
          <div className="dialog">
            <h3>💾 Зберегти запит</h3>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmSave()}
              placeholder="Назва запиту..."
              autoFocus
            />
            <div className="dialog-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setSaveDialog(false)}>Скасувати</button>
              <button className="btn btn-sm" onClick={confirmSave}>Зберегти</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getPlayers, addPlayer, getRoundEntries, submitRound, resetSeason,
  updatePlayerHcp, calcStats, type Player, type RoundEntry, type PlayerStats
} from '@/lib/supabase'

const MEDALS = ['🥇', '🥈', '🥉']
const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
const fmt = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)
const fmt2 = (n: number) => n.toFixed(2)
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
const calcPts = (pos: number, n: number, holes: number) => holes === 9 ? (n - pos + 1) * 0.5 : (n - pos + 1)

type ScoreRow = { id: number; playerName: string; position: number | '' }
type MatchGroup = { key: string; date: string; course: string; holes: number; entries: RoundEntry[] }

function groupMatches(rounds: RoundEntry[]): MatchGroup[] {
  const map = new Map<string, MatchGroup>()
  rounds.forEach(r => {
    const key = `${r.date}__${r.course}__${r.holes}__${r.created_at?.substring(0, 16) ?? r.id}`
    if (!map.has(key)) map.set(key, { key, date: r.date, course: r.course, holes: r.holes, entries: [] })
    map.get(key)!.entries.push(r)
  })
  return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Home() {
  const [tab, setTab] = useState<'leaderboard' | 'entry' | 'matches' | 'players'>('leaderboard')
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<RoundEntry[]>([])
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [course, setCourse] = useState('')
  const [holes, setHoles] = useState<9 | 18>(18)
  const [scoreRows, setScoreRows] = useState<ScoreRow[]>([
    { id: 0, playerName: '', position: '' },
    { id: 1, playerName: '', position: '' },
  ])
  const [nextRowId, setNextRowId] = useState(2)
  const [submitMsg, setSubmitMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [newName, setNewName] = useState('')
  const [newHcp, setNewHcp] = useState('')
  const [playerError, setPlayerError] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editHcp, setEditHcp] = useState('')
  const [editError, setEditError] = useState('')
  const [savingHcp, setSavingHcp] = useState(false)
  const [matchFilter, setMatchFilter] = useState<'all' | 9 | 18>('all')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [p, r] = await Promise.all([getPlayers(), getRoundEntries()])
      setPlayers(p)
      setRounds(r)
      setStats(calcStats(p, r))
      setError('')
    } catch {
      setError('Could not load data. Check your Supabase connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalLeader = stats[0]
  const avgLeader = [...stats].filter(s => s.rounds > 0).sort((a, b) => b.avg - a.avg)[0]
  const allMatches = groupMatches(rounds)
  const filteredMatches = matchFilter === 'all' ? allMatches : allMatches.filter(m => m.holes === matchFilter)
  const lastMatch = allMatches[0]

  const usedNames = scoreRows.map(r => r.playerName).filter(Boolean)
  const n = scoreRows.length

  const updateRow = (id: number, field: keyof ScoreRow, value: string | number) => {
    setScoreRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }
  const addRow = () => {
    if (scoreRows.length >= 12) return
    setScoreRows(rows => [...rows, { id: nextRowId, playerName: '', position: '' }])
    setNextRowId(id => id + 1)
  }
  const removeRow = (id: number) => {
    if (scoreRows.length <= 1) return
    setScoreRows(rows => rows.filter(r => r.id !== id))
  }
  const sortedRows = [...scoreRows].sort((a, b) => {
    const pa = a.position === '' ? 999 : a.position as number
    const pb = b.position === '' ? 999 : b.position as number
    return pa - pb
  })
  const bannerText = () => {
    if (n < 2) return 'Add at least 2 players to see points allocation.'
    const parts = Array.from({ length: n }, (_, i) => {
      const pts = calcPts(i + 1, n, holes)
      return `${ordinal(i + 1)} = ${fmt(pts)} pt${pts !== 1 ? 's' : ''}`
    })
    return `${holes}-hole points (${n} players): ${parts.join(', ')} · round counts as ${holes === 9 ? '0.5' : '1'}`
  }

  const handleSubmit = async () => {
    if (scoreRows.some(r => !r.playerName)) { alert('Please select a player for each row.'); return }
    if (scoreRows.some(r => r.position === '')) { alert('Please assign a position to each player.'); return }
    setSubmitting(true)
    try {
      const entries = scoreRows.map(r => ({
        player_name: r.playerName,
        holes,
        points: calcPts(r.position as number, n, holes),
      }))
      await submitRound(entries, date, course)
      const summary = [...scoreRows]
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map(r => `${ordinal(r.position as number)}: ${r.playerName.split(' ')[0]} (+${fmt(calcPts(r.position as number, n, holes))}pt)`)
        .join(' · ')
      setSubmitMsg(`Round saved! ${holes} holes · ${summary}`)
      setTimeout(() => setSubmitMsg(''), 6000)
      setScoreRows(rows => rows.map(r => ({ ...r, playerName: '', position: '' })))
      await loadData()
    } catch {
      alert('Failed to save round. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddPlayer = async () => {
    setPlayerError('')
    const name = newName.trim()
    const hcp = parseFloat(newHcp)
    if (!name) { setPlayerError('Please enter a name.'); return }
    if (players.find(p => p.name.toLowerCase() === name.toLowerCase())) { setPlayerError('Player already exists.'); return }
    if (isNaN(hcp) || hcp < 0 || hcp > 54) { setPlayerError('Please enter a valid handicap (0–54).'); return }
    setAddingPlayer(true)
    try {
      await addPlayer(name, hcp)
      setNewName(''); setNewHcp('')
      await loadData()
    } catch {
      setPlayerError('Failed to add player. Please try again.')
    } finally {
      setAddingPlayer(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await resetSeason()
      setShowReset(false)
      await loadData()
    } catch {
      alert('Failed to reset. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  const openEditHcp = (p: Player) => {
    setEditingPlayer(p)
    setEditHcp(String(p.hcp))
    setEditError('')
  }

  const handleSaveHcp = async () => {
    if (!editingPlayer) return
    const hcp = parseFloat(editHcp)
    if (isNaN(hcp) || hcp < 0 || hcp > 54) { setEditError('Please enter a valid handicap (0–54).'); return }
    setSavingHcp(true)
    try {
      await updatePlayerHcp(editingPlayer.id, hcp)
      setEditingPlayer(null)
      await loadData()
    } catch {
      setEditError('Failed to save. Please try again.')
    } finally {
      setSavingHcp(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⛳</div>
        <p className="text-gray-500 text-sm">Loading Chrompass Cup...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
        <p className="text-red-700 font-medium mb-2">Connection error</p>
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button onClick={loadData} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">Retry</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-xl mx-auto">

        <div style={{ background: '#1B4332' }} className="rounded-t-xl px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-medium">⛳ Chrompass Cup</h1>
            <p style={{ color: '#74B99A' }} className="text-sm mt-0.5">2026 / 27 Season</p>
          </div>
          <span className="text-4xl">🏆</span>
        </div>

        <div style={{ background: '#145228' }} className="flex">
          {(['leaderboard', 'entry', 'matches', 'players'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: tab === t ? '#fff' : '#74B99A',
                background: tab === t ? '#1B4332' : 'transparent',
                borderBottom: tab === t ? '2px solid #FFD700' : '2px solid transparent',
              }}
            >
              {t === 'leaderboard' ? 'Leaderboard' : t === 'entry' ? 'Submit' : t === 'matches' ? 'Matches' : 'Players'}
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-b-xl overflow-hidden">

          {/* LEADERBOARD */}
          {tab === 'leaderboard' && (
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-gray-50 border-2 rounded-xl p-4" style={{ borderColor: '#B8960C' }}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Total points leader</p>
                  <p className="text-sm font-medium text-gray-800">{totalLeader?.name ?? '—'}</p>
                  <p className="text-2xl font-medium mt-1" style={{ color: '#2D6A4F' }}>{totalLeader ? `${fmt(totalLeader.total)} pts` : '—'}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Avg points leader</p>
                  <p className="text-sm font-medium text-gray-800">{avgLeader?.name ?? '—'}</p>
                  <p className="text-2xl font-medium mt-1" style={{ color: '#2D6A4F' }}>{avgLeader ? `${fmt2(avgLeader.avg)} avg` : '—'}</p>
                </div>
              </div>
              <div style={{ gridTemplateColumns: '36px 1fr 56px 72px 60px', background: '#1B4332', borderRadius: '8px', marginBottom: '8px', padding: '8px 10px', display: 'grid', gap: '4px' }}>
                {['#', 'Player', 'Rounds', 'Total pts', 'Avg'].map((h, i) => (
                  <span key={h} className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: '#74B99A', textAlign: i === 1 ? 'left' : 'center' }}>{h}</span>
                ))}
              </div>
              {stats.map((p, i) => (
                <div key={p.name} style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 56px 72px 60px', gap: '4px', padding: '10px',
                  border: i === 0 ? '1px solid #B8960C' : i === 1 ? '1px solid #aaa' : i === 2 ? '1px solid #8B5E3C' : '1px solid #e5e7eb',
                  borderLeft: i === 0 ? '3px solid #B8960C' : i === 1 ? '3px solid #888' : i === 2 ? '3px solid #8B5E3C' : '1px solid #e5e7eb',
                  background: '#fafafa', borderRadius: '8px', marginBottom: '4px', alignItems: 'center',
                }}>
                  <div style={{ textAlign: 'center', fontSize: '15px' }}>{i < 3 ? MEDALS[i] : i + 1}</div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{p.name}</div>
                    <div className="text-xs text-gray-400">Hcp {p.hcp}</div>
                  </div>
                  <div className="text-sm text-gray-500" style={{ textAlign: 'center' }}>{fmt(p.rounds)}</div>
                  <div className="text-sm font-medium" style={{ textAlign: 'center', color: '#2D6A4F' }}>{fmt(p.total)}</div>
                  <div className="text-sm text-gray-500" style={{ textAlign: 'center' }}>{p.rounds > 0 ? fmt2(p.avg) : '—'}</div>
                </div>
              ))}
              {stats.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">No players yet. Add players in the Players tab.</p>
              )}
            </div>
          )}

          {/* SUBMIT SCORES */}
          {tab === 'entry' && (
            <div className="p-5">
              {submitMsg && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-700 text-sm text-center">{submitMsg}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Date', el: <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 overflow-hidden" style={{ maxWidth: '100%' }} /> },
                  { label: 'Course', el: <input type="text" value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. Royal Norwich" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800" /> },
                  { label: 'Holes', el: <select value={holes} onChange={e => setHoles(Number(e.target.value) as 9 | 18)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800"><option value={18}>18 holes</option><option value={9}>9 holes</option></select> },
                ].map(({ label, el }) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</label>
                    {el}
                  </div>
                ))}
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-green-700 flex items-start gap-2">
                <span className="mt-0.5">ℹ️</span>
                <span>{bannerText()}</span>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ background: '#145228', width: '140px', textAlign: 'left', padding: '9px 8px 9px 12px', color: '#74B99A', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Player</th>
                      <th style={{ background: '#1B4332', textAlign: 'center', padding: '9px 8px', color: '#74B99A', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Position</th>
                      <th style={{ background: '#0f3d24', width: '72px', textAlign: 'center', padding: '9px 8px', color: '#74B99A', fontSize: '11px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Points</th>
                      <th style={{ background: '#1B4332', width: '36px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, idx) => {
                      const pts = row.position !== '' ? calcPts(row.position as number, n, holes) : null
                      const rowBg = idx % 2 === 0 ? '#fff' : '#f9fafb'
                      return (
                        <tr key={row.id}>
                          <td style={{ borderTop: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#f9fafb' : '#f3f4f6', padding: '6px 6px 6px 12px' }}>
                            <select value={row.playerName} onChange={e => updateRow(row.id, 'playerName', e.target.value)} className="w-full border-none bg-transparent text-sm font-medium text-gray-800">
                              <option value="">Select...</option>
                              {players.map(p => (
                                <option key={p.name} value={p.name} disabled={usedNames.includes(p.name) && p.name !== row.playerName}>{p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ borderTop: '1px solid #e5e7eb', background: rowBg, padding: '6px', textAlign: 'center' }}>
                            <select value={row.position} onChange={e => updateRow(row.id, 'position', e.target.value === '' ? '' : Number(e.target.value))} className="border border-gray-200 rounded text-sm bg-white text-gray-800" style={{ width: '68px', padding: '4px' }}>
                              <option value="">—</option>
                              {Array.from({ length: n }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{ordinal(i + 1)}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ borderTop: '1px solid #e5e7eb', background: pts !== null ? '#f0faf4' : rowBg, padding: '6px', textAlign: 'center', fontSize: '13px', fontWeight: 500, color: '#2D6A4F' }}>
                            {pts !== null ? fmt(pts) : '—'}
                          </td>
                          <td style={{ borderTop: '1px solid #e5e7eb', background: rowBg, padding: '6px', textAlign: 'center' }}>
                            <button onClick={() => removeRow(row.id)} className="text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded w-6 h-6 flex items-center justify-center mx-auto text-sm">✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button onClick={addRow} disabled={scoreRows.length >= 12} className="flex-1 py-2.5 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-600 hover:text-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                  + Add player
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {submitting ? 'Saving...' : 'Submit round'}
                </button>
              </div>
            </div>
          )}

          {/* MATCHES */}
          {tab === 'matches' && (
            <div className="flex flex-col" style={{ height: '70vh' }}>
              {/* Sticky header — stats + filters */}
              <div className="p-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Rounds played</p>
                    <p className="text-2xl font-medium" style={{ color: '#2D6A4F' }}>{allMatches.length}</p>
                    <p className="text-xs text-gray-400 mt-1">this season</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Last played</p>
                    <p className="text-sm font-medium text-gray-800 mt-1">{lastMatch ? lastMatch.course || 'Unknown course' : '—'}</p>
                    <p className="text-xs text-gray-400 mt-1">{lastMatch ? formatDate(lastMatch.date) : '—'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(['all', 18, 9] as const).map(f => (
                    <button key={f} onClick={() => setMatchFilter(f)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                      style={{
                        background: matchFilter === f ? '#1B4332' : 'transparent',
                        color: matchFilter === f ? '#fff' : '#6b7280',
                        borderColor: matchFilter === f ? '#1B4332' : '#d1d5db',
                      }}>
                      {f === 'all' ? 'All' : `${f} holes`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable match list */}
              <div className="overflow-y-auto flex-1 p-5 pt-4">
                {filteredMatches.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No matches yet.</p>
                )}
                {filteredMatches.map((match) => {
                  const sorted = [...match.entries].sort((a, b) => b.points - a.points)
                  return (
                    <div key={match.key} className="border border-gray-200 rounded-xl mb-3 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{match.course || 'Unknown course'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(match.date)}</p>
                        </div>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                          style={{
                            background: match.holes === 18 ? '#EFF6FF' : '#FFFBEB',
                            color: match.holes === 18 ? '#1D4ED8' : '#92400E',
                          }}>
                          {match.holes} holes
                        </span>
                      </div>
                      <div className="px-4 py-2">
                        {sorted.map((e, i) => (
                          <div key={e.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                            <span style={{ fontSize: '14px', width: '22px', textAlign: 'center', flexShrink: 0 }}>
                              {i < 3 ? MEDALS[i] : <span className="text-xs text-gray-400">{i + 1}</span>}
                            </span>
                            <span className="flex-1 text-sm text-gray-800">{e.player_name}</span>
                            <span className="text-sm font-medium" style={{ color: '#2D6A4F' }}>+{fmt(e.points)} pt{e.points !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* PLAYERS */}
          {tab === 'players' && (
            <div className="p-5">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Add a new player</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Full name</label>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. James Smith" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Current handicap</label>
                    <input type="number" value={newHcp} onChange={e => setNewHcp(e.target.value)} placeholder="e.g. 14.2" min={0} max={54} step={0.1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800" />
                  </div>
                </div>
                {playerError && <p className="text-red-500 text-xs mb-2">{playerError}</p>}
                <button onClick={handleAddPlayer} disabled={addingPlayer} className="w-full py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: '#1B4332' }}>
                  {addingPlayer ? 'Adding...' : '+ Add to tournament'}
                </button>
              </div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Roster ({players.length} players)</p>
                <button onClick={() => setShowReset(true)} className="text-xs font-medium text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:border-red-300 hover:text-red-500 flex items-center gap-1">
                  ↺ Reset season
                </button>
              </div>
              {players.map(p => (
                <button key={p.name} onClick={() => openEditHcp(p)}
                  className="w-full flex items-center gap-3 border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50 hover:bg-green-50 hover:border-green-300 transition-colors text-left">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0" style={{ background: '#D8F3DC', color: '#1B4332' }}>
                    {initials(p.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="text-xs text-gray-400 mr-1">Hcp {p.hcp}</span>
                  <span className="text-xs text-gray-300">✎</span>
                </button>
              ))}
              {players.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">No players yet.</p>
              )}

              {editingPlayer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl p-6 max-w-xs w-full shadow-xl">
                    <h4 className="text-base font-medium text-gray-800 mb-1">Update handicap</h4>
                    <p className="text-sm text-gray-500 mb-4">{editingPlayer.name}</p>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">New handicap</label>
                    <input type="number" value={editHcp} onChange={e => setEditHcp(e.target.value)} min={0} max={54} step={0.1} autoFocus
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-800 mb-2"
                      onKeyDown={e => e.key === 'Enter' && handleSaveHcp()} />
                    {editError && <p className="text-red-500 text-xs mb-2">{editError}</p>}
                    <div className="flex gap-3 mt-3">
                      <button onClick={() => setEditingPlayer(null)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600">Cancel</button>
                      <button onClick={handleSaveHcp} disabled={savingHcp} className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-60" style={{ background: '#1B4332' }}>
                        {savingHcp ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showReset && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl p-6 max-w-xs w-full text-center shadow-xl">
                    <h4 className="text-base font-medium text-gray-800 mb-2">Reset season scores?</h4>
                    <p className="text-sm text-gray-500 mb-5 leading-relaxed">This clears all round results. Player names and handicaps are kept. This cannot be undone.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowReset(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600">Cancel</button>
                      <button onClick={handleReset} disabled={resetting} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                        {resetting ? 'Resetting...' : 'Reset season'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

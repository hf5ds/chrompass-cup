import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Player = {
  id: number
  name: string
  hcp: number
  created_at: string
}

export type RoundEntry = {
  id: number
  player_name: string
  holes: number
  points: number
  date: string
  course: string
  created_at: string
}

export type PlayerStats = {
  name: string
  hcp: number
  rounds: number
  total: number
  avg: number
}

export async function getPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function addPlayer(name: string, hcp: number): Promise<Player> {
  const { data, error } = await supabase
    .from('players')
    .insert({ name, hcp })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePlayerHcp(id: number, hcp: number): Promise<void> {
  const { error } = await supabase.from('players').update({ hcp }).eq('id', id)
  if (error) throw error
}

export async function getRoundEntries(): Promise<RoundEntry[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function submitRound(
  entries: { player_name: string; holes: number; points: number }[],
  date: string,
  course: string
): Promise<void> {
  const rows = entries.map(e => ({
    player_name: e.player_name,
    holes: e.holes,
    points: e.points,
    date,
    course,
  }))
  const { error } = await supabase.from('rounds').insert(rows)
  if (error) throw error
}

export async function resetSeason(): Promise<void> {
  const { error } = await supabase.from('rounds').delete().neq('id', 0)
  if (error) throw error
}

export function calcStats(players: Player[], rounds: RoundEntry[]): PlayerStats[] {
  return players
    .map(p => {
      const playerRounds = rounds.filter(r => r.player_name === p.name)
      const total = playerRounds.reduce((sum, r) => sum + r.points, 0)
      const roundCount = playerRounds.reduce(
        (sum, r) => sum + (r.holes === 9 ? 0.5 : 1),
        0
      )
      return {
        name: p.name,
        hcp: p.hcp,
        rounds: Math.round(roundCount * 100) / 100,
        total: Math.round(total * 100) / 100,
        avg: roundCount > 0 ? Math.round((total / roundCount) * 100) / 100 : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

import { supabase } from '../../../lib/supabase'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Revisa el archivo .env.local.')
  return supabase
}

export async function getWorksites() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('worksites')
    .select('id, name, address, active, created_at')
    .order('active', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createWorksite({ name, address }) {
  const client = requireSupabase()
  const cleanName = String(name ?? '').trim()
  const cleanAddress = String(address ?? '').trim()
  if (!cleanName) throw new Error('Escribe el nombre de la obra.')
  if (cleanName.length > 120) throw new Error('El nombre no puede superar los 120 caracteres.')
  if (cleanAddress.length > 250) throw new Error('La dirección no puede superar los 250 caracteres.')

  const { data: userResult, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!userResult.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')

  const { data, error } = await client
    .from('worksites')
    .insert({ name: cleanName, address: cleanAddress || null, created_by: userResult.user.id })
    .select('id, name, address, active, created_at')
    .single()
  if (error) throw error
  return data
}

export async function updateWorksiteStatus(id, active) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('worksites')
    .update({ active })
    .eq('id', id)
    .select('id, name, address, active, created_at')
    .single()
  if (error) throw error
  return data
}

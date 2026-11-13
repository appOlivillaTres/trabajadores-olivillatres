import { supabase } from '../../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export async function listPurchaseRequests() {
  const { data, error } = await client()
    .from('purchase_requests')
    .select(`
      id, requested_by, requested_at, worksite_id, worksite_name,
      description, observations, status, ordered_at, expected_delivery_at,
      received_at, rejected_reason, reviewed_by, updated_at,
      requester:profiles!purchase_requests_requested_by_fkey(id, username, display_name),
      reviewer:profiles!purchase_requests_reviewed_by_fkey(id, username, display_name)
    `)
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createPurchaseRequest(payload) {
  const { data: authData, error: authError } = await client().auth.getUser()
  if (authError) throw authError
  if (!authData.user) throw new Error('Tu sesión ha caducado. Inicia sesión de nuevo.')
  const { data, error } = await client().from('purchase_requests')
    .insert({ ...payload, requested_by: authData.user.id })
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function updatePurchaseRequest(id, payload) {
  const { data, error } = await client().from('purchase_requests')
    .update(payload)
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('La solicitud ya no está pendiente y no se puede modificar.')
}

export async function cancelPurchaseRequest(id) {
  const { data, error } = await client().from('purchase_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('La solicitud ya no está pendiente y no se puede cancelar.')
}

export async function updatePurchaseStatus(id, payload, expectedStatus = 'pending') {
  const { data, error } = await client().from('purchase_requests')
    .update(payload)
    .eq('id', id)
    .eq('status', expectedStatus)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('La solicitud ya ha sido gestionada por otra persona. Actualiza la lista.')
}

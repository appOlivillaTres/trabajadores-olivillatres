import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const aliasEmail = (username: string) => `${username.trim().toLowerCase()}@users.olivillatres.invalid`

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'Falta configurar la función con las variables de Supabase.' }, 500)
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Debes iniciar sesión como administrador.' }, 401)
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: authData, error: authError } = await callerClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'La sesión no es válida.' }, 401)
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: callerProfile, error: profileError } = await adminClient.from('profiles').select('role, active').eq('id', authData.user.id).maybeSingle()
  if (profileError || callerProfile?.role !== 'admin' || callerProfile?.active !== true) return json({ error: 'Solo un administrador activo puede gestionar cuentas.' }, 403)
  let body: { action?: string; username?: string; displayName?: string; password?: string; workerId?: string }
  try { body = await request.json() } catch { return json({ error: 'La solicitud no es válida.' }, 400) }
  const password = String(body.password ?? '')
  if (password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400)

  if (body.action === 'create') {
    const username = String(body.username ?? '').trim().toLowerCase(), displayName = String(body.displayName ?? '').trim()
    if (!/^[a-z0-9._-]{1,32}$/.test(username)) return json({ error: 'El usuario debe tener entre 1 y 32 caracteres y solo puede contener letras sin acentos, números, puntos, guiones o guiones bajos.' }, 400)
    if (!displayName || displayName.length > 100) return json({ error: 'Introduce el nombre completo del trabajador.' }, 400)
    const { data: existing, error: existingError } = await adminClient.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existingError) return json({ error: existingError.message }, 400)
    if (existing) return json({ error: 'Ya existe un trabajador con ese nombre de usuario.' }, 409)
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: aliasEmail(username), password, email_confirm: true, user_metadata: { username, display_name: displayName } })
    if (createError || !created.user) return json({ error: createError?.message || 'No se ha podido crear el usuario.' }, 400)
    const { error: upsertError } = await adminClient.from('profiles').upsert({ id: created.user.id, username, display_name: displayName, role: 'worker', active: true }, { onConflict: 'id' })
    if (upsertError) { await adminClient.auth.admin.deleteUser(created.user.id); return json({ error: `No se ha podido crear el perfil: ${upsertError.message}` }, 500) }
    return json({ ok: true, workerId: created.user.id })
  }
  if (body.action === 'reset-password') {
    const workerId = String(body.workerId ?? '')
    if (!workerId) return json({ error: 'Falta seleccionar el trabajador.' }, 400)
    const { data: worker, error: workerError } = await adminClient.from('profiles').select('id, role').eq('id', workerId).maybeSingle()
    if (workerError || !worker || worker.role !== 'worker') return json({ error: 'No se ha encontrado el trabajador.' }, 404)
    const { error } = await adminClient.auth.admin.updateUserById(workerId, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }
  return json({ error: 'Acción no reconocida.' }, 400)
})

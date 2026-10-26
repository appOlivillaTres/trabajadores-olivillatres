
const AUTH_ALIAS_DOMAIN = 'users.olivillatres.invalid'

export function usernameToAuthEmail(username) {
  const normalized = String(username ?? '').trim().toLowerCase()

  if (!/^[a-z0-9._-]{1,32}$/.test(normalized)) {
    throw new Error(
      'El usuario debe tener entre 1 y 32 caracteres y solo puede contener letras sin acentos, números, puntos, guiones o guiones bajos.'
    )
  }

  return `${normalized}@${AUTH_ALIAS_DOMAIN}`
}

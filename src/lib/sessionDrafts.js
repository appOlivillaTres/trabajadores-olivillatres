/**
 * Pequeño almacén de borradores de una sesión. Se usa para que navegar entre
 * páginas de la aplicación o recargar la pestaña no borre formularios sin enviar.
 */
export function readSessionDraft(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeSessionDraft(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Si el navegador bloquea sessionStorage, la aplicación sigue funcionando.
  }
}

export function removeSessionDraft(key) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // La eliminación del borrador no debe impedir la operación principal.
  }
}

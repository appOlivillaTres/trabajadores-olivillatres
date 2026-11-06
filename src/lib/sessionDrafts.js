// Los borradores se recuperan únicamente al recargar el documento completo.
// La navegación entre apartados de React debe abrir formularios vacíos.
const NAVIGATION_TYPE = typeof window !== 'undefined'
  ? window.performance?.getEntriesByType?.('navigation')?.[0]?.type
  : 'navigate'
const INITIAL_PATH = typeof window !== 'undefined' ? window.location.pathname : ''

// Solo se permite restaurar en la ruta que abrió el documento. Así, al navegar
// dentro de React Router, ningún componente puede recuperar un borrador antiguo
// durante el primer render antes de que AppLayout ejecute su efecto de limpieza.
let draftRecoveryAllowed = NAVIGATION_TYPE === 'reload'
const DRAFT_PREFIX = 'olivillatres:'

export function disableSessionDraftRecovery() {
  draftRecoveryAllowed = false
}

export function clearSessionDrafts() {
  if (typeof window === 'undefined') return
  try {
    const keys = []
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index)
      if (key?.startsWith(DRAFT_PREFIX) || key?.startsWith('epis-delivery-form-v1:')) keys.push(key)
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // La limpieza de borradores nunca debe interrumpir la navegación.
  }
}

export function readSessionDraft(key) {
  if (typeof window === 'undefined' || !draftRecoveryAllowed || window.location.pathname !== INITIAL_PATH) return null
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

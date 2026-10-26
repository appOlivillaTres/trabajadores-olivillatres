const SHARED_DATE_RANGE_KEY = 'olivillatres:shared-report-date-range'

function toLocalDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDateValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function getDefaultReportDateRange(now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const from = new Date(to)
  from.setDate(from.getDate() - 9)

  return {
    fromDate: toLocalDateString(from),
    toDate: toLocalDateString(to),
  }
}

/**
 * Comparte el intervalo entre las páginas de historial y revisión y lo conserva
 * al navegar por la aplicación o recargarla. Los demás filtros son por pantalla.
 */
export function readSharedReportDateRange() {
  const fallback = getDefaultReportDateRange()
  if (typeof window === 'undefined') return fallback

  try {
    const stored = JSON.parse(window.localStorage.getItem(SHARED_DATE_RANGE_KEY) || 'null')
    if (
      stored &&
      isDateValue(stored.fromDate) &&
      isDateValue(stored.toDate) &&
      stored.fromDate <= stored.toDate
    ) {
      return { fromDate: stored.fromDate, toDate: stored.toDate }
    }
  } catch {
    // Si localStorage no está disponible o contiene datos no válidos, se usan los últimos 10 días.
  }

  return fallback
}

export function saveSharedReportDateRange({ fromDate, toDate } = {}) {
  if (typeof window === 'undefined' || !isDateValue(fromDate) || !isDateValue(toDate) || fromDate > toDate) return

  try {
    window.localStorage.setItem(SHARED_DATE_RANGE_KEY, JSON.stringify({ fromDate, toDate }))
  } catch {
    // El filtro sigue funcionando durante la sesión aunque el navegador bloquee el almacenamiento.
  }
}

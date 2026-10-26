import { useCallback, useRef, useState } from 'react'
import {
  readSharedReportDateRange,
  saveSharedReportDateRange,
} from '../utils/reportFiltersStorage'

/**
 * Mantiene los filtros propios de cada pantalla y comparte únicamente las fechas.
 * Admite tanto un objeto como una función actualizadora, igual que useState.
 */
export function useReportFilters(additionalDefaults = {}) {
  const initialFiltersRef = useRef(null)
  if (initialFiltersRef.current === null) {
    initialFiltersRef.current = {
      ...readSharedReportDateRange(),
      ...additionalDefaults,
    }
  }

  const filtersRef = useRef(initialFiltersRef.current)
  const [filters, setFiltersState] = useState(initialFiltersRef.current)

  const setFilters = useCallback((nextFiltersOrUpdater) => {
    const nextFilters = typeof nextFiltersOrUpdater === 'function'
      ? nextFiltersOrUpdater(filtersRef.current)
      : nextFiltersOrUpdater

    if (!nextFilters || typeof nextFilters !== 'object') return

    filtersRef.current = nextFilters
    setFiltersState(nextFilters)
    saveSharedReportDateRange(nextFilters)
  }, [])

  return [filters, setFilters]
}

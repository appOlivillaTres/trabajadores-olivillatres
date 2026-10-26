import { useCallback, useEffect, useRef, useState } from 'react'
import { useReportFilters } from './useReportFilters'
import { getReportsWithDetails } from '../services/reportsQueryService'
import { getCorrectionRequestsForReports } from '../../corrections/services/correctionRequestsService'
import { getReportChangeHistoryForReports } from '../../corrections/services/reportChangesService'


export function useMyReports() {
  const [filters, setFilters] = useReportFilters({ workerId: '', hasIncidentOnly: false, searchText: '' })
  const initialFiltersRef = useRef(filters)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [correctionWarning, setCorrectionWarning] = useState('')

  const load = useCallback(async (nextFilters) => {
    setLoading(true)
    setError('')
    setCorrectionWarning('')
    try {
      const reportRows = await getReportsWithDetails(nextFilters)
      const warnings = []
      let requestRows = []
      let historyRows = []
      try {
        requestRows = await getCorrectionRequestsForReports(reportRows.map((report) => report.id))
      } catch (requestError) {
        warnings.push(requestError.message || 'No se han podido cargar los estados de las solicitudes de corrección.')
      }
      try {
        historyRows = await getReportChangeHistoryForReports(reportRows.map((report) => report.id))
      } catch (historyError) {
        warnings.push(historyError.message || 'No se ha podido cargar el historial de cambios.')
      }
      const requestsByReport = new Map()
      for (const request of requestRows) {
        const list = requestsByReport.get(request.report_id) ?? []
        list.push(request)
        requestsByReport.set(request.report_id, list)
      }
      const historyByReport = new Map()
      for (const entry of historyRows) {
        const list = historyByReport.get(entry.report_id) ?? []
        list.push(entry)
        historyByReport.set(entry.report_id, list)
      }
      setCorrectionWarning([...new Set(warnings)].join(' '))
      setReports(reportRows.map((report) => ({
        ...report,
        correctionRequests: requestsByReport.get(report.id) ?? [],
        changeHistory: historyByReport.get(report.id) ?? [],
      })))
    } catch (loadError) {
      setError(loadError.message || 'No se ha podido cargar el historial de partes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(initialFiltersRef.current)
  }, [load])

  return { filters, setFilters, reports, loading, error, correctionWarning, load }
}

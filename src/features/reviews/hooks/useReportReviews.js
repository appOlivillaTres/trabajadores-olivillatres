import { useCallback, useEffect, useRef, useState } from 'react'
import { useReportFilters } from '../../reports/hooks/useReportFilters'
import {
  getReportsWithDetails,
  getWorkersForFilter,
  updateReportReviewStatus,
  updateWorkReportDirectly,
} from '../services/reviewsService'
import { getWorksites } from '../../worksites/services/worksitesService'
import { getReportChangeHistoryForReports } from '../../corrections/services/reportChangesService'


export function useReportReviews() {
  const [filters, setFilters] = useReportFilters({ workerId: '', hasIncidentOnly: false, searchText: '' })
  const initialFiltersRef = useRef(filters)
  const [workers, setWorkers] = useState([])
  const [worksites, setWorksites] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [historyWarning, setHistoryWarning] = useState('')

  const load = useCallback(async (nextFilters) => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const [workerRows, worksiteRows, reportRows] = await Promise.all([
        getWorkersForFilter(),
        getWorksites(),
        getReportsWithDetails(nextFilters),
      ])
      let historyRows = []
      try {
        historyRows = await getReportChangeHistoryForReports(reportRows.map((report) => report.id))
        setHistoryWarning('')
      } catch (historyError) {
        setHistoryWarning(historyError.message || 'No se ha podido cargar el historial de cambios.')
      }
      const historyByReport = new Map()
      for (const entry of historyRows) {
        const list = historyByReport.get(entry.report_id) ?? []
        list.push(entry)
        historyByReport.set(entry.report_id, list)
      }
      setWorkers(workerRows)
      setWorksites(worksiteRows)
      setReports(reportRows.map((report) => ({ ...report, changeHistory: historyByReport.get(report.id) ?? [] })))
    } catch (loadError) {
      setError(loadError.message || 'No se han podido cargar los partes para revisión.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(initialFiltersRef.current)
  }, [load]) // La primera carga usa las fechas compartidas o, si no existen, los últimos 10 días.

  const changeStatus = useCallback(async (reportId, status) => {
    setUpdatingId(reportId)
    setError('')
    setNotice('')
    try {
      const updated = await updateReportReviewStatus(reportId, status)
      let historyRows = []
      try {
        historyRows = await getReportChangeHistoryForReports([reportId])
        setHistoryWarning('')
      } catch (historyError) {
        setHistoryWarning(historyError.message || 'No se ha podido actualizar el historial de cambios.')
      }
      setReports((current) => current.map((report) =>
        report.id === reportId ? {
          ...report,
          review_status: updated.review_status,
          changeHistory: historyRows,
        } : report,
      ))
      setNotice(status === 'approved'
        ? 'Parte marcado como revisado.'
        : status === 'needs_changes'
          ? 'Parte marcado para corrección.'
          : 'Parte devuelto al estado pendiente.')
      return true
    } catch (updateError) {
      setError(updateError.message || 'No se ha podido actualizar la revisión.')
      return false
    } finally {
      setUpdatingId('')
    }
  }, [])

  const saveReportEdit = useCallback(async (reportId, values) => {
    setUpdatingId(reportId)
    setError('')
    setNotice('')
    try {
      await updateWorkReportDirectly(reportId, values)
      await load(filters)
      setNotice('Parte actualizado. Si estaba revisado, vuelve a quedar pendiente de revisión.')
      return true
    } catch (updateError) {
      setError(updateError.message || 'No se ha podido guardar la edición del parte.')
      return false
    } finally {
      setUpdatingId('')
    }
  }, [filters, load])

  return {
    filters,
    setFilters,
    workers,
    worksites,
    reports,
    loading,
    updatingId,
    error,
    notice,
    historyWarning,
    load,
    changeStatus,
    saveReportEdit,
  }
}

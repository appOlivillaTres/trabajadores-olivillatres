import { useCallback, useEffect, useState } from 'react'
import { getWorksites } from '../../worksites/services/worksitesService'
import { getActiveWorkers } from '../../employees/services/employeesService'
import { createWorkReport as createWorkReportService } from '../services/workReportsService'

export function useWorkReports() {
  const [worksites, setWorksites] = useState([])
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadFormData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [worksiteResults, workerResults] = await Promise.all([
        getWorksites(),
        getActiveWorkers(),
      ])
      setWorksites(worksiteResults.filter((worksite) => worksite.active))
      setWorkers(workerResults)
    } catch (loadError) {
      setError(loadError.message || 'No se han podido cargar las obras y los trabajadores.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadFormData() }, [loadFormData])

  const create = useCallback(async (values) => {
    setSaving(true)
    setError('')
    try {
      const reportId = await createWorkReportService(values)
      return reportId
    } catch (createError) {
      setError(createError.message || 'No se ha podido guardar el parte.')
      throw createError
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    worksites,
    workers,
    loading,
    saving,
    error,
    loadFormData,
    createWorkReport: create,
    clearError: () => setError(''),
  }
}

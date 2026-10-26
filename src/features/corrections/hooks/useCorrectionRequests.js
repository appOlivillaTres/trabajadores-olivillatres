import { useCallback, useEffect, useState } from 'react'
import { getWorksites } from '../../worksites/services/worksitesService'
import { getPendingCorrectionRequests, resolveCorrectionRequest } from '../services/correctionRequestsService'

export function useCorrectionRequests(filters = {}) {
  const [requests, setRequests] = useState([])
  const [worksites, setWorksites] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const [requestRows, worksiteRows] = await Promise.all([
        getPendingCorrectionRequests(filters),
        getWorksites(),
      ])
      setRequests(requestRows)
      setWorksites(worksiteRows)
    } catch (loadError) {
      setError(loadError.message || 'No se han podido cargar las solicitudes de corrección.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load])

  const resolve = useCallback(async ({ requestId, decision, correctedValue = '', adminResponse = '', targetType = '' }) => {
    setResolvingId(requestId)
    setError('')
    setNotice('')
    try {
      await resolveCorrectionRequest({ requestId, decision, correctedValue, adminResponse, targetType })
      setNotice(decision === 'accepted'
        ? (targetType === 'new_worksite'
          ? 'Obra añadida correctamente y solicitud aceptada. La nueva actividad queda pendiente de revisión.'
          : 'Corrección aplicada y solicitud aceptada. Si el parte estaba revisado, ha vuelto a quedar pendiente.')
        : 'Solicitud rechazada y respuesta guardada.')
      await load({ quiet: true })
      return true
    } catch (resolveError) {
      setError(resolveError.message || 'No se ha podido resolver la solicitud.')
      return false
    } finally {
      setResolvingId('')
    }
  }, [load])

  return { requests, worksites, loading, resolvingId, error, notice, load, resolve }
}

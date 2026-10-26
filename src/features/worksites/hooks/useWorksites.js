import { useCallback, useEffect, useState } from 'react'
import {
  createWorksite as createWorksiteService,
  getWorksites as getWorksitesService,
  updateWorksiteStatus,
} from '../services/worksitesService'

export function useWorksites() {
  const [worksites, setWorksites] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [error, setError] = useState('')

  const loadWorksites = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setWorksites(await getWorksitesService())
    } catch (loadError) {
      setError(loadError.message || 'No se han podido cargar las obras.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadWorksites() }, [loadWorksites])

  const create = useCallback(async (values) => {
    setSaving(true)
    setError('')
    try {
      await createWorksiteService(values)
      await loadWorksites()
    } catch (createError) {
      setError(createError.message || 'No se ha podido crear la obra.')
      throw createError
    } finally {
      setSaving(false)
    }
  }, [loadWorksites])

  const changeStatus = useCallback(async (id, active) => {
    setUpdatingId(id)
    setError('')
    try {
      const updated = await updateWorksiteStatus(id, active)
      setWorksites((current) => current
        .map((worksite) => worksite.id === id ? updated : worksite)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es')))
    } catch (updateError) {
      setError(updateError.message || 'No se ha podido actualizar la obra.')
    } finally {
      setUpdatingId(null)
    }
  }, [])

  return { worksites, loading, saving, updatingId, error, loadWorksites, createWorksite: create, changeWorksiteStatus: changeStatus }
}

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Los borradores se guardan por usuario y ruta. localStorage sobrevive tanto a
// una recarga como a que Chrome descarte una pestaña por falta de memoria.
const STORAGE_PREFIX = 'olivillatres:form-draft:v2:'
const EXCLUDED_TYPES = new Set([
  'password', 'file', 'submit', 'button', 'reset', 'image', 'hidden',
])

function getFieldKey(field, index) {
  return field.dataset.draftKey || field.name || field.id || `field-${index}`
}

function getFormKey(form, index) {
  return form.dataset.draftKey || `form-${index}`
}

function getFields(form) {
  if (form.hasAttribute('data-draft-exclude')) return []
  return Array.from(form.elements).filter((field) => {
    if (!field?.tagName) return false
    const tag = field.tagName.toLowerCase()
    if (!['input', 'select', 'textarea'].includes(tag)) return false
    if (field.disabled || (field.type && EXCLUDED_TYPES.has(field.type))) return false
    return true
  })
}

function getLooseFields() {
  return Array.from(document.querySelectorAll(
    'main input, main select, main textarea, #root input, #root select, #root textarea',
  )).filter((field) => (
    !field.closest('form')
    && !field.closest('[data-draft-exclude]')
    && !field.disabled
    && !(field.type && EXCLUDED_TYPES.has(field.type))
  ))
}

function readField(field) {
  if (field.type === 'checkbox') return { kind: 'checkbox', value: field.checked }
  if (field.type === 'radio') return { kind: 'radio', value: field.checked ? field.value : null }
  if (field.multiple) {
    return {
      kind: 'multiple',
      value: Array.from(field.options).filter((option) => option.selected).map((option) => option.value),
    }
  }
  return { kind: 'value', value: field.value }
}

function snapshotFields(fields, key) {
  const values = {}
  fields.forEach((field, index) => {
    const fieldKey = getFieldKey(field, index)
    const saved = readField(field)
    if (field.type === 'radio') {
      if (saved.value !== null || !Object.prototype.hasOwnProperty.call(values, fieldKey)) {
        values[fieldKey] = saved
      }
    } else {
      values[fieldKey] = saved
    }
  })
  return { key, values }
}

function setNativeValue(field, value) {
  const prototype = field.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : field.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(field, value)
  else field.value = value
}

function dispatchReactChange(field, eventName) {
  field.dispatchEvent(new Event(eventName, { bubbles: true }))
}

function restoreField(field, saved) {
  if (saved.kind === 'checkbox' || field.type === 'checkbox') {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
    if (setter) setter.call(field, Boolean(saved.value))
    else field.checked = Boolean(saved.value)
    dispatchReactChange(field, 'click')
    dispatchReactChange(field, 'change')
    return
  }

  if (field.type === 'radio') {
    const checked = saved.value !== null && field.value === saved.value
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
    if (setter) setter.call(field, checked)
    else field.checked = checked
    dispatchReactChange(field, 'click')
    dispatchReactChange(field, 'change')
    return
  }

  if (saved.kind === 'multiple' && field.multiple) {
    const selected = new Set(Array.isArray(saved.value) ? saved.value : [])
    Array.from(field.options).forEach((option) => { option.selected = selected.has(option.value) })
    dispatchReactChange(field, 'change')
    return
  }

  setNativeValue(field, saved.value ?? '')
  dispatchReactChange(field, field.tagName === 'SELECT' ? 'change' : 'input')
  dispatchReactChange(field, 'change')
}

function getCurrentSnapshot() {
  const forms = Array.from(document.querySelectorAll('main form, #root form'))
  const payload = forms.map((form, index) => (
    snapshotFields(getFields(form), getFormKey(form, index))
  ))
  const looseFields = getLooseFields()
  if (looseFields.length) payload.push(snapshotFields(looseFields, 'loose-fields'))
  return payload.filter((group) => Object.keys(group.values).length > 0)
}

export default function FormDraftPersistence({ userId }) {
  const location = useLocation()
  const initialPathRef = useRef(location.pathname)
  const restoreConsumedRef = useRef(false)
  const previousLocationRef = useRef({ pathname: location.pathname, userId })

  // Al navegar dentro de la SPA se empieza con formularios vacíos. Los
  // borradores solo se restauran cuando el documento se ha recargado.
  const navigationType = typeof window !== 'undefined'
    ? window.performance?.getEntriesByType?.('navigation')?.[0]?.type
    : 'navigate'
  const canRestoreOnThisRoute = navigationType === 'reload'
    && location.pathname === initialPathRef.current
    && !restoreConsumedRef.current

  useEffect(() => {
    const previous = previousLocationRef.current
    if (previous.pathname !== location.pathname && previous.userId) {
      try {
        localStorage.removeItem(`${STORAGE_PREFIX}${previous.userId}:${previous.pathname}`)
      } catch {
        // Ignorar errores de almacenamiento.
      }
    }
    previousLocationRef.current = { pathname: location.pathname, userId }
  }, [location.pathname, userId])

  useEffect(() => {
    if (!userId) return undefined

    const storageKey = `${STORAGE_PREFIX}${userId}:${location.pathname}`
    let restoring = true
    let applyingRestore = false
    let userInteracted = false
    let observer
    let restoreAttempts = 0
    let finishTimer
    const restoredFields = new WeakSet()

    const saveAll = () => {
      try {
        const payload = getCurrentSnapshot()
        if (payload.length) {
          localStorage.setItem(storageKey, JSON.stringify({
            savedAt: Date.now(),
            pathname: location.pathname,
            forms: payload,
          }))
        }
      } catch {
        // La persistencia nunca debe interrumpir el uso normal de la aplicación.
      }
    }

    const restoreAll = () => {
      if (!canRestoreOnThisRoute) {
        restoring = false
        observer?.disconnect()
        return
      }
      if (userInteracted || !restoring || restoreAttempts > 80) {
        observer?.disconnect()
        restoring = false
        return
      }

      let saved
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null')
        // Evita recuperar formularios abandonados hace más de 7 días.
        if (!parsed || !Array.isArray(parsed.forms)
          || !parsed.savedAt || Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
          restoreConsumedRef.current = true
          restoring = false
          observer?.disconnect()
          return
        }
        saved = parsed.forms
        restoreConsumedRef.current = true
      } catch {
        restoreConsumedRef.current = true
        restoring = false
        observer?.disconnect()
        return
      }

      restoreAttempts += 1
      const forms = Array.from(document.querySelectorAll('main form, #root form'))
      const groups = forms.map((form, index) => ({
        key: getFormKey(form, index),
        fields: getFields(form),
      }))
      const looseFields = getLooseFields()
      if (looseFields.length) groups.push({ key: 'loose-fields', fields: looseFields })

      applyingRestore = true
      groups.forEach((group) => {
        const savedForm = saved.find((item) => item.key === group.key)
        if (!savedForm?.values) return
        group.fields.forEach((field, fieldIndex) => {
          if (restoredFields.has(field)) return
          const value = savedForm.values[getFieldKey(field, fieldIndex)]
          if (!value) return
          restoreField(field, value)
          restoredFields.add(field)
        })
      })

      // Se deja un margen para que las pantallas que cargan datos de Supabase
      // monten sus controles antes de cerrar la restauración.
      applyingRestore = false
      if (restoreAttempts >= 80) {
        restoring = false
        observer?.disconnect()
      }
    }

    const handleUserInput = (event) => {
      if (!event.target?.matches?.('input, select, textarea')) return
      if (applyingRestore) return
      userInteracted = true
      observer?.disconnect()
      saveAll()
    }

    const handlePageHide = () => saveAll()
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') saveAll()
    }
    const handleReset = (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return
      window.setTimeout(() => {
        try {
          const existing = JSON.parse(localStorage.getItem(storageKey) || 'null')
          if (!existing?.forms) return
          const index = Array.from(document.querySelectorAll('main form, #root form')).indexOf(form)
          const key = getFormKey(form, index)
          existing.forms = existing.forms.filter((item) => item.key !== key)
          if (existing.forms.length) localStorage.setItem(storageKey, JSON.stringify(existing))
          else localStorage.removeItem(storageKey)
        } catch {
          // Ignorar errores de almacenamiento.
        }
      }, 0)
    }

    document.addEventListener('input', handleUserInput, true)
    document.addEventListener('change', handleUserInput, true)
    document.addEventListener('reset', handleReset, true)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibility)

    // La primera pasada restaura los campos ya montados. El observer cubre
    // formularios que aparecen después de una consulta asíncrona.
    const root = document.querySelector('main') || document.getElementById('root')
    if (root && canRestoreOnThisRoute) {
      observer = new MutationObserver(() => {
        if (!userInteracted && restoring) restoreAll()
      })
      observer.observe(root, { childList: true, subtree: true })
    }
    const initialTimer = canRestoreOnThisRoute ? window.setTimeout(restoreAll, 100) : null
    finishTimer = canRestoreOnThisRoute ? window.setTimeout(() => {
      restoring = false
      observer?.disconnect()
    }, 5000) : null

    return () => {
      // Los cambios se guardan en cada input y al ocultarse la pestaña.
      window.clearTimeout(initialTimer)
      window.clearTimeout(finishTimer)
      observer?.disconnect()
      document.removeEventListener('input', handleUserInput, true)
      document.removeEventListener('change', handleUserInput, true)
      document.removeEventListener('reset', handleReset, true)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [userId, location.pathname, canRestoreOnThisRoute])

  return null
}

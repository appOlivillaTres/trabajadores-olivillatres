import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReportDateFilters from '../features/reports/components/ReportDateFilters'
import WorkdayGroupCard from '../features/reports/components/WorkdayGroupCard'
import { groupWorkReportsByWorkerDay } from '../features/reports/utils/groupWorkReportsByWorkerDay'
import { useMyReports } from '../features/reports/hooks/useMyReports'
import { useAuth } from '../hooks/useAuth'

export default function MyReportsPage() {
  const { filters, setFilters, reports, loading, error, correctionWarning, load } = useMyReports()
  const location = useLocation()
  const handledFocusLocationRef = useRef('')
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('pending')

  const dayGroups = useMemo(
    () => groupWorkReportsByWorkerDay(reports, user?.id ?? ''),
    [reports, user?.id],
  )
  const pendingGroups = dayGroups.filter((group) => group.summaryStatus !== 'approved')
  const reviewedGroups = dayGroups.filter((group) => group.summaryStatus === 'approved')
  const groupsToShow = activeTab === 'reviewed' ? reviewedGroups : pendingGroups

  // Si el trabajador viene desde «Nuevo parte», abre la pestaña en la que
  // aparece la jornada seleccionada (pendiente o ya revisada).
  useEffect(() => {
    const focusDate = location.state?.focusDate
    if (!focusDate || loading || handledFocusLocationRef.current === location.key) return
    handledFocusLocationRef.current = location.key

    const matchingGroups = dayGroups.filter((group) => group.workDate === focusDate)
    if (matchingGroups.some((group) => group.summaryStatus !== 'approved')) {
      setActiveTab('pending')
    } else if (matchingGroups.length > 0) {
      setActiveTab('reviewed')
    }
  }, [location.key, location.state, loading, dayGroups])

  function handleSearch(event) {
    event.preventDefault()
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) return
    void load(filters)
  }

  return (
    <main>
      <h1 className="h2 fw-bold mb-1">Mis partes</h1>
      <p className="text-secondary mb-4">Consulta cada jornada con sus obras y horas. Por defecto se muestran los últimos 10 días; puedes cambiar el periodo cuando lo necesites.</p>

      <ReportDateFilters
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        onFromDateChange={(fromDate) => setFilters((current) => ({ ...current, fromDate }))}
        onToDateChange={(toDate) => setFilters((current) => ({ ...current, toDate }))}
        hasIncidentOnly={filters.hasIncidentOnly}
        onHasIncidentOnlyChange={(hasIncidentOnly) => setFilters((current) => ({ ...current, hasIncidentOnly }))}
        searchText={filters.searchText}
        onSearchTextChange={(searchText) => setFilters((current) => ({ ...current, searchText }))}
        onSubmit={handleSearch}
        loading={loading}
      />

      {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
      {correctionWarning && <div className="alert alert-warning mt-3" role="alert">El historial se ha cargado, pero no se han podido cargar algunos datos de corrección. {correctionWarning}</div>}
      {filters.fromDate && filters.toDate && filters.fromDate > filters.toDate && <div className="alert alert-warning mt-3">La fecha inicial no puede ser posterior a la fecha final.</div>}

      <ul className="nav nav-tabs mt-4 mb-3" role="tablist" aria-label="Estado de mis partes">
        <li className="nav-item" role="presentation">
          <button type="button" className={`nav-link ${activeTab === 'pending' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'pending'} onClick={() => setActiveTab('pending')}>
            Pendientes de revisión <span className="badge text-bg-warning ms-1">{pendingGroups.length}</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button type="button" className={`nav-link ${activeTab === 'reviewed' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'reviewed'} onClick={() => setActiveTab('reviewed')}>
            Revisados <span className="badge text-bg-success ms-1">{reviewedGroups.length}</span>
          </button>
        </li>
      </ul>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando partes…</span></div><p className="text-secondary mt-2 mb-0">Cargando tus partes…</p></div>
      ) : groupsToShow.length === 0 ? (
        <div className="card border-0 bg-light"><div className="card-body text-center py-5"><h2 className="h5">No hay jornadas {activeTab === 'reviewed' ? 'revisadas' : 'pendientes'} en este periodo</h2><p className="text-secondary mb-0">Prueba con otro intervalo o consulta la otra pestaña.</p></div></div>
      ) : (
        <>
          <p className="small text-secondary">{groupsToShow.length} {groupsToShow.length === 1 ? 'jornada' : 'jornadas'} en esta pestaña.</p>
          {groupsToShow.map((group) => (
            <WorkdayGroupCard
              key={group.id}
              group={group}
              view="worker"
              canRequestCorrection
              currentUserId={user?.id ?? ''}
              onCorrectionSubmitted={() => load(filters)}
            />
          ))}
        </>
      )}
    </main>
  )
}

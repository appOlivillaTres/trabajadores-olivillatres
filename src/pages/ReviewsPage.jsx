import { useEffect, useMemo, useState } from 'react'
import ReportDateFilters from '../features/reports/components/ReportDateFilters'
import WorkdayGroupCard from '../features/reports/components/WorkdayGroupCard'
import { groupWorkReportsByWorkerDay } from '../features/reports/utils/groupWorkReportsByWorkerDay'
import { useReportReviews } from '../features/reviews/hooks/useReportReviews'
import CorrectionRequestsPanel from '../features/corrections/components/CorrectionRequestsPanel'
import { readSessionDraft, writeSessionDraft } from '../lib/sessionDrafts'

function formatLongDate(value) {
  if (!value || value === 'sin-fecha') return 'Fecha no disponible'
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

function getTabFromStatus(groups, reportId, nextStatus) {
  const affectedGroup = groups.find((item) => item.reports.some((report) => report.id === reportId))
  if (!affectedGroup) return nextStatus === 'needs_changes' ? 'corrections' : nextStatus === 'approved' ? 'reviewed' : 'pending'

  const statuses = affectedGroup.reports.map((report) => report.id === reportId ? nextStatus : report.review_status)
  if (statuses.includes('needs_changes')) return 'corrections'
  if (statuses.length > 0 && statuses.every((status) => status === 'approved')) return 'reviewed'
  return 'pending'
}

function groupByDate(groups) {
  const byDate = new Map()
  for (const group of groups) {
    const key = group.workDate || 'sin-fecha'
    const list = byDate.get(key) ?? []
    list.push(group)
    byDate.set(key, list)
  }
  return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a))
}

export default function ReviewsPage() {
  const [activeTab, setActiveTab] = useState(() => readSessionDraft('olivillatres:reviews-active-tab')?.activeTab ?? 'pending')
  useEffect(() => {
    writeSessionDraft('olivillatres:reviews-active-tab', { activeTab })
  }, [activeTab])

  const {
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
  } = useReportReviews()
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...filters }))

  const dayGroups = useMemo(
    () => groupWorkReportsByWorkerDay(reports, appliedFilters.workerId),
    [reports, appliedFilters.workerId],
  )
  const pendingGroups = dayGroups.filter((group) => group.summaryStatus === 'pending' || group.summaryStatus === 'partial')
  const reviewedGroups = dayGroups.filter((group) => group.summaryStatus === 'approved')
  const correctionGroups = dayGroups.filter((group) => group.summaryStatus === 'needs_changes')
  const groupsToShow = activeTab === 'pending'
    ? pendingGroups
    : activeTab === 'reviewed'
      ? reviewedGroups
      : correctionGroups

  async function handleReviewStatusChange(reportId, status) {
    const targetTab = getTabFromStatus(dayGroups, reportId, status)
    const succeeded = await changeStatus(reportId, status)
    if (succeeded) setActiveTab(targetTab)
  }

  function handleSearch(event) {
    event.preventDefault()
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) return
    const nextAppliedFilters = { ...filters }
    setAppliedFilters(nextAppliedFilters)
    void load(nextAppliedFilters)
  }

  function renderGroups(groups, emptyTitle) {
    if (loading) {
      return <div className="text-center py-5"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Cargando jornadas…</span></div><p className="text-secondary mt-2 mb-0">Cargando jornadas…</p></div>
    }
    if (groups.length === 0) {
      return <div className="card border-0 bg-light"><div className="card-body text-center py-5"><h2 className="h5">{emptyTitle}</h2><p className="text-secondary mb-0">Prueba con otras fechas o selecciona otro trabajador.</p></div></div>
    }

    return (
      <>
        <p className="small text-secondary">{groups.length} {groups.length === 1 ? 'jornada' : 'jornadas'} mostradas. Cada jornada agrupa las obras de un trabajador en una fecha.</p>
        {groupByDate(groups).map(([dateKey, dateGroups]) => (
          <section key={dateKey} className="mb-4" aria-label={`Partes del día ${formatLongDate(dateKey)}`}>
            <div className="d-flex align-items-center gap-3 mb-3 mt-4">
              <h2 className="h5 fw-bold text-capitalize mb-0">{formatLongDate(dateKey)}</h2>
              <span className="badge rounded-pill text-bg-light border text-secondary">
                {dateGroups.length} {dateGroups.length === 1 ? 'trabajador' : 'trabajadores'}
              </span>
              <div className="flex-grow-1 border-bottom" aria-hidden="true" />
            </div>
            {dateGroups.map((group) => (
              <WorkdayGroupCard
                key={group.id}
                group={group}
                view="admin"
                canReview
                showDate={false}
                updatingId={updatingId}
                onReviewStatusChange={handleReviewStatusChange}
                worksites={worksites}
                onSaveReportEdit={saveReportEdit}
              />
            ))}
          </section>
        ))}
      </>
    )
  }

  return (
    <main>
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h2 fw-bold mb-1">Revisión de partes</h1>
          <p className="text-secondary mb-0">Las jornadas se agrupan por trabajador y fecha. Puedes revisar cada obra, editar el parte directamente o resolver solicitudes de corrección.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <span className="badge text-bg-warning py-2">Jornadas por revisar: {pendingGroups.length}</span>
        </div>
      </div>

      <ReportDateFilters
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        onFromDateChange={(fromDate) => setFilters((current) => ({ ...current, fromDate }))}
        onToDateChange={(toDate) => setFilters((current) => ({ ...current, toDate }))}
        workers={workers}
        workerId={filters.workerId}
        onWorkerChange={(workerId) => setFilters((current) => ({ ...current, workerId }))}
        hasIncidentOnly={filters.hasIncidentOnly}
        onHasIncidentOnlyChange={(hasIncidentOnly) => setFilters((current) => ({ ...current, hasIncidentOnly }))}
        searchText={filters.searchText}
        onSearchTextChange={(searchText) => setFilters((current) => ({ ...current, searchText }))}
        showWorkerFilter
        onSubmit={handleSearch}
        loading={loading}
      />

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {historyWarning && <div className="alert alert-warning" role="alert">No se ha podido cargar la auditoría. {historyWarning}</div>}
      {filters.fromDate && filters.toDate && filters.fromDate > filters.toDate && <div className="alert alert-warning">La fecha inicial no puede ser posterior a la fecha final.</div>}

      <ul className="nav nav-tabs mb-4" role="tablist" aria-label="Estados de revisión">
        <li className="nav-item" role="presentation">
          <button type="button" className={`nav-link ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')} role="tab" aria-selected={activeTab === 'pending'}>Pendientes de revisión</button>
        </li>
        <li className="nav-item" role="presentation">
          <button type="button" className={`nav-link ${activeTab === 'reviewed' ? 'active' : ''}`} onClick={() => setActiveTab('reviewed')} role="tab" aria-selected={activeTab === 'reviewed'}>Revisados</button>
        </li>
        <li className="nav-item" role="presentation">
          <button type="button" className={`nav-link ${activeTab === 'corrections' ? 'active' : ''}`} onClick={() => setActiveTab('corrections')} role="tab" aria-selected={activeTab === 'corrections'}>Correcciones solicitadas</button>
        </li>
      </ul>

      {activeTab === 'pending' && renderGroups(groupsToShow, 'No hay jornadas pendientes de revisión')}
      {activeTab === 'reviewed' && renderGroups(groupsToShow, 'No hay jornadas revisadas')}
      {activeTab === 'corrections' && (
        <>
          <section className="mb-4">
            <h2 className="h4 fw-bold mb-1">Partes marcados para corrección</h2>
            <p className="text-secondary">Las obras que necesitan corrección aparecerán aquí; también puedes gestionar solicitudes concretas enviadas por los trabajadores.</p>
            {renderGroups(correctionGroups, 'No hay jornadas marcadas para corrección')}
          </section>
          <hr className="my-4" />
          <CorrectionRequestsPanel filters={appliedFilters} onResolved={() => load(appliedFilters)} />
        </>
      )}
    </main>
  )
}

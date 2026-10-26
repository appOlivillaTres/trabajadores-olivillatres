/**
 * Agrupa los bloques de work_reports en una única jornada por trabajador y fecha.
 * El estado de revisión sigue perteneciendo a cada bloque/obra en la base de datos;
 * la tarjeta diaria muestra el resumen de esos estados, sin perder el detalle de cada obra.
 */
export function groupWorkReportsByWorkerDay(reports = [], workerId = '') {
  const groupsByKey = new Map()

  for (const report of reports ?? []) {
    const participants = Array.isArray(report.participants) ? report.participants : []
    const relevantParticipants = workerId
      ? participants.filter((participant) => participant.worker_id === workerId)
      : participants

    for (const participant of relevantParticipants) {
      const key = `${report.work_date}::${participant.worker_id}`
      let group = groupsByKey.get(key)

      if (!group) {
        group = {
          id: key,
          workDate: report.work_date,
          workerId: participant.worker_id,
          worker: participant.profile ?? null,
          reports: [],
          totalHours: 0,
          reportIds: new Set(),
        }
        groupsByKey.set(key, group)
      }

      // Protege frente a duplicados si una consulta devuelve la misma fila más de una vez.
      if (group.reportIds.has(report.id)) continue
      group.reportIds.add(report.id)

      const hours = Number(participant.hours) || 0
      group.reports.push({
        ...report,
        dayWorkerParticipant: participant,
        dayWorkerHours: hours,
      })
      group.totalHours += hours
    }
  }

  return [...groupsByKey.values()]
    .map((group) => {
      const statuses = group.reports.map((report) => report.review_status)
      const allApproved = statuses.length > 0 && statuses.every((status) => status === 'approved')
      const hasNeedsChanges = statuses.some((status) => status === 'needs_changes')
      const hasApproved = statuses.some((status) => status === 'approved')
      const hasPending = statuses.some((status) => status === 'pending')

      let summaryStatus = 'pending'
      if (allApproved) summaryStatus = 'approved'
      else if (hasNeedsChanges) summaryStatus = 'needs_changes'
      else if (hasApproved && hasPending) summaryStatus = 'partial'

      const { reportIds, ...visibleGroup } = group
      return {
        ...visibleGroup,
        reports: group.reports.sort((a, b) => {
          const createdCompare = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
          if (createdCompare !== 0) return createdCompare
          return String(a.worksite?.name ?? '').localeCompare(String(b.worksite?.name ?? ''), 'es')
        }),
        summaryStatus,
      }
    })
    .sort((a, b) => {
      const dateCompare = String(b.workDate).localeCompare(String(a.workDate))
      if (dateCompare !== 0) return dateCompare
      return String(a.worker?.display_name ?? '').localeCompare(String(b.worker?.display_name ?? ''), 'es')
    })
}

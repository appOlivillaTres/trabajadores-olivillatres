import { useEffect, useMemo, useRef, useState } from 'react'
import { getReportsWithDetails, getWorkersForFilter } from '../features/reports/services/reportsQueryService'
import { getWorkdaySchedulesForRange } from '../features/reports/services/workdaySchedulesService'
import { getAbsences } from '../features/employees/services/absencesService'
import { downloadWorkReportsWorkbook, textCell, numberCell } from '../features/exports/createWorkReportsWorkbook'

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function getToday() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function localDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(parseLocalDate(value))
}

function formatShortDate(value, includeMonth = false) {
  const date = parseLocalDate(value)
  return includeMonth ? `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}` : String(date.getDate())
}

function makeCalendarWeeks(monthValue) {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return []
  const [year, month] = monthValue.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1, 12)
  const lastDay = new Date(year, month, 0, 12)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const cursor = new Date(year, month - 1, 1 - mondayOffset, 12)
  const weeks = []

  while (cursor <= lastDay) {
    const start = new Date(cursor)
    const end = new Date(cursor)
    end.setDate(end.getDate() + 6)
    weeks.push({ fromDate: localDateValue(start), toDate: localDateValue(end) })
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

function getDatesBetween(fromDate, toDate) {
  const dates = []
  const cursor = parseLocalDate(fromDate)
  const last = parseLocalDate(toDate)
  while (cursor <= last) {
    dates.push(localDateValue(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function displayName(profile) {
  return profile?.display_name || profile?.username || 'Trabajador'
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : ''
}

function createExportSheets({ title, intervalLabel, dates, workers, reports, scheduleRows, absences, selectedWorkerId, mode }) {
  const workerMap = new Map()
  const getWorker = (id, profile = null) => {
    if (!id) return null
    if (!workerMap.has(id)) {
      workerMap.set(id, {
        id,
        profile: profile ?? { id, display_name: 'Trabajador' },
        days: new Map(),
      })
    } else if (profile && workerMap.get(id).profile?.display_name === 'Trabajador') {
      workerMap.get(id).profile = profile
    }
    return workerMap.get(id)
  }
  const getDay = (workerId, workDate, profile = null) => {
    const worker = getWorker(workerId, profile)
    if (!worker) return null
    if (!worker.days.has(workDate)) {
      worker.days.set(workDate, { workDate, totalHours: 0, worksites: new Set(), reports: [], schedule: null, absences: [] })
    }
    return worker.days.get(workDate)
  }

  for (const worker of workers) {
    if (!selectedWorkerId || worker.id === selectedWorkerId) getWorker(worker.id, worker)
  }

  const detailEntries = []
  for (const report of reports) {
    for (const participant of report.participants ?? []) {
      if (selectedWorkerId && participant.worker_id !== selectedWorkerId) continue
      const person = participant.profile ?? workers.find((worker) => worker.id === participant.worker_id) ?? null
      const day = getDay(participant.worker_id, report.work_date, person)
      if (!day) continue
      const hours = Number(participant.hours) || 0
      day.totalHours += hours
      if (report.worksite?.name) day.worksites.add(report.worksite.name)
      day.reports.push({ report, hours })
      detailEntries.push({ report, participant, profile: person, hours })
    }
  }

  // Añade las ausencias a cada día del intervalo sin reemplazar partes ni horarios.
  const dateSet = new Set(dates)
  for (const absence of absences ?? []) {
    if (selectedWorkerId && absence.worker_id !== selectedWorkerId) continue
    const profile = absence.profiles ?? workers.find((worker) => worker.id === absence.worker_id) ?? null
    const start = absence.starts_on > dates[0] ? absence.starts_on : dates[0]
    const end = absence.ends_on < dates[dates.length - 1] ? absence.ends_on : dates[dates.length - 1]
    if (!start || !end || start > end) continue
    for (const date of getDatesBetween(start, end)) {
      if (!dateSet.has(date)) continue
      const day = getDay(absence.worker_id, date, profile)
      if (!day) continue
      const label = absence.absence_type === 'sick_leave' ? 'Baja laboral' : 'Vacaciones'
      if (!day.absences.some((item) => item.id === absence.id)) day.absences.push({ id: absence.id, label })
    }
  }

  const scheduleByKey = new Map()
  for (const schedule of scheduleRows) {
    if (selectedWorkerId && schedule.worker_id !== selectedWorkerId) continue
    scheduleByKey.set(`${schedule.work_date}::${schedule.worker_id}`, schedule)
    const person = workers.find((worker) => worker.id === schedule.worker_id) ?? null
    getDay(schedule.worker_id, schedule.work_date, person).schedule = schedule
  }

  const orderedWorkers = [...workerMap.values()].sort((a, b) =>
    displayName(a.profile).localeCompare(displayName(b.profile), 'es'),
  )
  detailEntries.sort((a, b) => {
    const dateCompare = String(b.report.work_date).localeCompare(String(a.report.work_date))
    if (dateCompare) return dateCompare
    const nameCompare = displayName(a.profile).localeCompare(displayName(b.profile), 'es')
    if (nameCompare) return nameCompare
    return String(a.report.worksite?.name ?? '').localeCompare(String(b.report.worksite?.name ?? ''), 'es')
  })

  // Resumen diario: cada obra ocupa su propia fila. Las columnas de trabajador
  // y usuario se agrupan visualmente por trabajador; fecha, total diario y horario
  // se agrupan por trabajador/día para que no parezcan horas duplicadas.
  const summaryLastColumnIndex = 10
  const summaryLastColumn = columnNameForExcel(summaryLastColumnIndex)
  const summaryRows = []
  const summaryTitle = Array(summaryLastColumnIndex + 1).fill(null)
  summaryTitle[0] = textCell(title, 1)
  summaryRows.push(summaryTitle)
  const summarySubtitle = Array(summaryLastColumnIndex + 1).fill(null)
  summarySubtitle[0] = textCell(
    `Intervalo del informe: ${intervalLabel}. Cada obra tiene su propia fila. «Horas en obra» es el tiempo registrado en esa obra; «Total horas del día» suma las horas de todas las obras del trabajador en esa fecha. La entrada y salida son informativas e incluyen la pausa de almuerzo; no se usan para calcular las horas trabajadas.`,
    2,
  )
  summaryRows.push(summarySubtitle)
  summaryRows.push([])
  summaryRows.push([
    'Fecha',
    'Trabajador',
    'Usuario',
    'Obra',
    'Horas en obra',
    'Total horas del día',
    'Hora de entrada',
    'Hora de salida',
    'Trabajo realizado',
    'Total horas del periodo',
    'Ausencia',
  ].map((value) => textCell(value, 3)))

  const summaryMerges = [
    `A1:${summaryLastColumn}1`,
    `A2:${summaryLastColumn}2`,
  ]
  const summaryRowHeights = { 1: 30, 2: 48, 4: 30 }
  let nextExcelRow = 5

  for (const worker of orderedWorkers) {
    const daysWithData = [...worker.days.entries()]
      .filter(([workDate]) => dates.includes(workDate))
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    if (!daysWithData.length) continue

    const workerStartRow = nextExcelRow
    const workerPeriodTotalHours = daysWithData.reduce((sum, [, day]) => sum + (Number(day.totalHours) || 0), 0)
    for (const [workDate, day] of daysWithData) {
      const dayEntries = [...day.reports].sort((a, b) =>
        String(a.report.worksite?.name ?? '').localeCompare(String(b.report.worksite?.name ?? ''), 'es'),
      )
      // Conserva los horarios aunque aún no haya una obra registrada ese día.
      const rowsForDay = dayEntries.length ? dayEntries : [null]
      const dayStartRow = nextExcelRow
      const schedule = day.schedule ?? scheduleByKey.get(`${workDate}::${worker.id}`)

      rowsForDay.forEach((entry, entryIndex) => {
        const row = Array(summaryLastColumnIndex + 1).fill(null)
        const firstInDay = entryIndex === 0
        row[0] = firstInDay ? textCell(formatLongDate(workDate), 6) : textCell('', 6)
        row[1] = firstInDay ? textCell(displayName(worker.profile), 6) : textCell('', 6)
        row[2] = firstInDay ? textCell(worker.profile?.username ?? '', 6) : textCell('', 6)
        row[3] = textCell(entry ? (entry.report.worksite?.name ?? 'Obra no disponible') : '', 6)
        row[4] = entry ? numberCell(entry.hours) : textCell('', 5)
        row[5] = firstInDay && day.totalHours > 0 ? numberCell(day.totalHours) : textCell('', 5)
        row[6] = firstInDay ? textCell(formatTime(schedule?.entry_time), 6) : textCell('', 6)
        row[7] = firstInDay ? textCell(formatTime(schedule?.exit_time), 6) : textCell('', 6)
        row[8] = textCell(entry?.report?.activity_description ?? '', 6)
        row[9] = nextExcelRow === workerStartRow && workerPeriodTotalHours > 0
          ? numberCell(workerPeriodTotalHours)
          : textCell('', 5)
        row[10] = firstInDay ? textCell((day.absences ?? []).map((item) => item.label).filter((value, index, list) => list.indexOf(value) === index).join(' / '), 6) : textCell('', 6)
        summaryRows.push(row)
        summaryRowHeights[nextExcelRow] = 48
        nextExcelRow += 1
      })

      const dayEndRow = nextExcelRow - 1
      if (dayEndRow > dayStartRow) {
        for (const column of ['A', 'F', 'G', 'H']) {
          summaryMerges.push(`${column}${dayStartRow}:${column}${dayEndRow}`)
        }
      }
    }

    const workerEndRow = nextExcelRow - 1
    if (workerEndRow > workerStartRow) {
      summaryMerges.push(`B${workerStartRow}:B${workerEndRow}`)
      summaryMerges.push(`C${workerStartRow}:C${workerEndRow}`)
      summaryMerges.push(`J${workerStartRow}:J${workerEndRow}`)
    }
  }

  if (summaryRows.length === 4) {
    const emptyRow = Array(summaryLastColumnIndex + 1).fill(null)
    emptyRow[0] = textCell('No hay partes ni horarios registrados en este intervalo.', 6)
    summaryRows.push(emptyRow)
    summaryMerges.push(`A5:${summaryLastColumn}5`)
    summaryRowHeights[5] = 30
  }

  const summaryWidths = [22, 27, 18, 28, 14, 22, 16, 16, 48, 22, 20]

  // Detalle: una línea por trabajador/obra, sin duplicar el horario diario.
  const detailLastColumnIndex = 9
  const detailLastColumn = columnNameForExcel(detailLastColumnIndex)
  const detailRows = [
    [textCell('Detalle de partes de trabajo', 1)],
    [textCell(`Intervalo: ${intervalLabel}. Una fila por trabajador y obra; el horario se consulta en la hoja «Horarios diarios».`, 2)],
    [],
    ['Fecha', 'Trabajador', 'Usuario', 'Obra', 'Horas en obra', 'Trabajo realizado', 'Observaciones', 'Incidencia', 'Estado de revisión', 'Registrado por'].map((value) => textCell(value, 3)),
  ]
  for (const item of detailEntries) {
    const report = item.report
    detailRows.push([
      textCell(formatLongDate(report.work_date), 6),
      textCell(displayName(item.profile), 6),
      textCell(item.profile?.username ?? '', 6),
      textCell(report.worksite?.name ?? 'Obra no disponible', 6),
      numberCell(item.hours),
      textCell(report.activity_description ?? '', 6),
      textCell(report.observations ?? '', 6),
      textCell(report.has_incident ? (report.incident_details || 'Sí, sin detalle') : 'No', 6),
      textCell(({ pending: 'Pendiente', approved: 'Revisado', needs_changes: 'Necesita corrección' })[report.review_status] ?? report.review_status ?? '', 6),
      textCell(report.author?.display_name ?? report.author?.username ?? '', 6),
    ])
  }
  if (!detailEntries.length) detailRows.push([textCell('No hay partes registrados en este intervalo.', 6)])
  detailRows[0] = Array(detailLastColumnIndex + 1).fill(null).map((_, index) => index === 0 ? textCell('Detalle de partes de trabajo', 1) : null)
  detailRows[1] = Array(detailLastColumnIndex + 1).fill(null).map((_, index) => index === 0 ? textCell(`Intervalo: ${intervalLabel}. Una fila por trabajador y obra; el horario se consulta en la hoja «Horarios diarios».`, 2) : null)
  const detailRowHeights = { 1: 30, 2: 32, 4: 30 }
  for (let r = 5; r <= detailRows.length; r += 1) detailRowHeights[r] = 64

  // Horarios: una sola fila por persona/fecha, sin replicarlo por cada obra.
  const schedulePairs = new Map()
  for (const worker of orderedWorkers) {
    for (const [workDate, day] of worker.days) {
      schedulePairs.set(`${workDate}::${worker.id}`, { workDate, worker, schedule: day.schedule ?? null })
    }
  }
  for (const schedule of scheduleRows) {
    if (selectedWorkerId && schedule.worker_id !== selectedWorkerId) continue
    const worker = workerMap.get(schedule.worker_id) ?? getWorker(schedule.worker_id, workers.find((row) => row.id === schedule.worker_id))
    if (!worker) continue
    schedulePairs.set(`${schedule.work_date}::${schedule.worker_id}`, { workDate: schedule.work_date, worker, schedule })
  }
  const orderedSchedulePairs = [...schedulePairs.values()].sort((a, b) => {
    const dateCompare = String(b.workDate).localeCompare(String(a.workDate))
    return dateCompare || displayName(a.worker.profile).localeCompare(displayName(b.worker.profile), 'es')
  })
  const scheduleRowsSheet = [
    Array(6).fill(null).map((_, index) => index === 0 ? textCell('Horarios diarios', 1) : null),
    Array(6).fill(null).map((_, index) => index === 0 ? textCell(`Intervalo: ${intervalLabel}. El horario es informativo e incluye la pausa de almuerzo estipulada; no calcula ni modifica las horas registradas en cada obra.`, 2) : null),
    [],
    ['Fecha', 'Trabajador', 'Usuario', 'Hora de entrada', 'Hora de salida', 'Estado'].map((value) => textCell(value, 3)),
    ...orderedSchedulePairs.map(({ workDate, worker, schedule }) => [
      textCell(formatLongDate(workDate), 6),
      textCell(displayName(worker.profile), 6),
      textCell(worker.profile?.username ?? '', 6),
      textCell(formatTime(schedule?.entry_time), 6),
      textCell(formatTime(schedule?.exit_time), 6),
      textCell((worker.days.get(workDate)?.absences ?? []).map((item) => item.label).filter((value, index, list) => list.indexOf(value) === index).join(' / ') || (schedule?.entry_time && schedule?.exit_time ? 'Registrado' : 'Sin horario registrado'), 6),
    ]),
  ]
  if (!orderedSchedulePairs.length) scheduleRowsSheet.push([textCell('No hay horarios ni jornadas en este intervalo.', 6)])
  const scheduleRowHeights = { 1: 30, 2: 34, 4: 28 }
  for (let r = 5; r <= scheduleRowsSheet.length; r += 1) scheduleRowHeights[r] = 24

  const filteredAbsences = (absences ?? []).filter((absence) =>
    (!selectedWorkerId || absence.worker_id === selectedWorkerId)
    && absence.ends_on >= dates[0]
    && absence.starts_on <= dates[dates.length - 1],
  ).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on))
    || displayName(a.profiles ?? workers.find((worker) => worker.id === a.worker_id)).localeCompare(displayName(b.profiles ?? workers.find((worker) => worker.id === b.worker_id)), 'es'))
  const absenceRowsSheet = [
    [textCell('Ausencias del periodo', 1)],
    [textCell(`Intervalo: ${intervalLabel}. Las ausencias se muestran por separado y no se contabilizan como horas trabajadas.`, 2)],
    [],
    ['Trabajador', 'Usuario', 'Tipo de ausencia', 'Desde', 'Hasta', 'Nota administrativa'].map((value) => textCell(value, 3)),
    ...filteredAbsences.map((absence) => {
      const profile = absence.profiles ?? workers.find((worker) => worker.id === absence.worker_id)
      return [
        textCell(displayName(profile), 6),
        textCell(profile?.username ?? '', 6),
        textCell(absence.absence_type === 'sick_leave' ? 'Baja laboral' : 'Vacaciones', 6),
        textCell(formatLongDate(absence.starts_on), 6),
        textCell(formatLongDate(absence.ends_on), 6),
        textCell(absence.admin_note ?? '', 6),
      ]
    }),
  ]
  if (!filteredAbsences.length) absenceRowsSheet.push([textCell('No hay ausencias registradas en este intervalo.', 6)])
  const absenceRowHeights = { 1: 30, 2: 32, 4: 28 }
  for (let r = 5; r <= absenceRowsSheet.length; r += 1) absenceRowHeights[r] = 28

  return [
    {
      name: 'Resumen diario',
      rows: summaryRows,
      merges: summaryMerges,
      widths: summaryWidths,
      freezePane: { xSplit: 3, ySplit: 4, topLeftCell: 'D5', activePane: 'bottomRight' },
      rowHeights: summaryRowHeights,
    },
    {
      name: 'Detalle de obras',
      rows: detailRows,
      merges: [`A1:${detailLastColumn}1`, `A2:${detailLastColumn}2`],
      widths: [19, 25, 18, 27, 14, 50, 35, 32, 22, 25],
      freezePane: { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' },
      rowHeights: detailRowHeights,
    },
    {
      name: 'Ausencias',
      rows: absenceRowsSheet,
      merges: ['A1:F1', 'A2:F2'],
      widths: [28, 18, 22, 22, 22, 45],
      freezePane: { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' },
      rowHeights: absenceRowHeights,
    },
    {
      name: 'Horarios diarios',
      rows: scheduleRowsSheet,
      merges: ['A1:F1', 'A2:F2'],
      widths: [22, 27, 18, 18, 18, 25],
      freezePane: { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' },
      rowHeights: scheduleRowHeights,
    },
  ]
}

function columnNameForExcel(index) {
  let value = index + 1
  let output = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    output = String.fromCharCode(65 + remainder) + output
    value = Math.floor((value - 1) / 26)
  }
  return output
}

export default function ReportsExportPage() {
  const todayMonth = getToday().slice(0, 7)
  const [mode, setMode] = useState('month')
  const [monthValue, setMonthValue] = useState(todayMonth)
  const [weekIndex, setWeekIndex] = useState('0')
  const [workerId, setWorkerId] = useState('')
  const [workers, setWorkers] = useState([])
  const [workerSearch, setWorkerSearch] = useState('')
  const [workerPickerOpen, setWorkerPickerOpen] = useState(false)
  const workerPickerRef = useRef(null)
  const [loadingWorkers, setLoadingWorkers] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const weeks = useMemo(() => makeCalendarWeeks(monthValue), [monthValue])
  const interval = useMemo(() => {
    if (mode === 'week') return weeks[Number(weekIndex)] ?? weeks[0] ?? null
    if (!/^\d{4}-\d{2}$/.test(monthValue)) return null
    const [year, month] = monthValue.split('-').map(Number)
    return { fromDate: `${monthValue}-01`, toDate: `${monthValue}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` }
  }, [mode, monthValue, weekIndex, weeks])
  const intervalLabel = interval ? `${formatLongDate(interval.fromDate)} – ${formatLongDate(interval.toDate)}` : ''
  const filteredWorkers = useMemo(() => {
    const search = workerSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    if (!search) return workers
    return workers.filter((worker) => `${worker.display_name ?? ''} ${worker.username ?? ''}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes(search))
  }, [workers, workerSearch])
  const selectedWorker = workers.find((worker) => worker.id === workerId)
  const selectedWorkerLabel = selectedWorker
    ? `${selectedWorker.display_name || selectedWorker.username || 'Trabajador'}${selectedWorker.username ? ` · ${selectedWorker.username}` : ''}`
    : ''


  useEffect(() => {
    let cancelled = false
    getWorkersForFilter()
      .then((rows) => { if (!cancelled) setWorkers(rows) })
      .catch((loadError) => { if (!cancelled) setError(loadError.message || 'No se ha podido cargar la lista de trabajadores.') })
      .finally(() => { if (!cancelled) setLoadingWorkers(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (Number(weekIndex) >= weeks.length) setWeekIndex('0')
  }, [weekIndex, weeks.length])

  useEffect(() => {
    if (!workerPickerOpen) return undefined

    function handleOutsidePointerDown(event) {
      if (!workerPickerRef.current?.contains(event.target)) {
        setWorkerPickerOpen(false)
        setWorkerSearch('')
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setWorkerPickerOpen(false)
        setWorkerSearch('')
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [workerPickerOpen])

  async function handleExport(event) {
    event.preventDefault()
    if (!interval) {
      setError('Selecciona un mes o una semana válida.')
      return
    }
    if (interval.fromDate > interval.toDate) {
      setError('La fecha inicial no puede ser posterior a la fecha final.')
      return
    }

    setExporting(true)
    setError('')
    setNotice('')
    try {
      const filters = { ...interval, workerId }
      const [reports, schedules, workerRows, absences] = await Promise.all([
        getReportsWithDetails(filters),
        getWorkdaySchedulesForRange(filters),
        getWorkersForFilter(),
        getAbsences({ from: interval.fromDate, to: interval.toDate, workerId }),
      ])
      const dates = getDatesBetween(interval.fromDate, interval.toDate)
      const monthLabel = (() => {
        const [year, month] = monthValue.split('-').map(Number)
        return `${MONTH_NAMES[month - 1]} ${year}`
      })()
      const title = mode === 'month'
        ? `INFORME DE TRABAJO · ${monthLabel.toLocaleUpperCase('es')}`
        : `INFORME SEMANAL · ${formatLongDate(interval.fromDate)} – ${formatLongDate(interval.toDate)}`
      const sheets = createExportSheets({
        title,
        intervalLabel,
        dates,
        workers: workerRows,
        reports,
        scheduleRows: schedules,
        absences,
        selectedWorkerId: workerId,
        mode,
      })
      const safeWorker = workerId
        ? `-${(workerRows.find((worker) => worker.id === workerId)?.username || 'trabajador').replace(/[^a-z0-9_-]/gi, '-')}`
        : '-todos'
      const filename = mode === 'month'
        ? `olivillatres-informe-${monthValue}${safeWorker}.xlsx`
        : `olivillatres-informe-semana-${interval.fromDate}-${interval.toDate}${safeWorker}.xlsx`
      downloadWorkReportsWorkbook({ sheets, filename })
      setNotice(`Excel generado para ${intervalLabel}. Incluye resumen diario, detalle por obra y horarios diarios sin duplicarlos por cada obra.`)
    } catch (exportError) {
      const message = exportError.message || 'No se ha podido generar el informe.'
      setError(message.toLowerCase().includes('workday_schedules')
        ? `${message} Comprueba que la migración de horario único está instalada en Supabase.`
        : message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <main>
      <div className="mb-4">
        <p className="text-success text-uppercase small fw-semibold mb-1">Informes</p>
        <h1 className="h2 fw-bold mb-1">Exportar Excel</h1>
        <p className="text-secondary mb-0">Genera informes mensuales o semanales. Las semanas se calculan de lunes a domingo y pueden cruzar de mes.</p>
      </div>

      <form className="card border-0 shadow-sm" onSubmit={handleExport}>
        <div className="card-body p-3 p-md-4">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-4">
              <label htmlFor="export-period-type" className="form-label">Periodo del informe</label>
              <select id="export-period-type" className="form-select" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="month">Mes completo</option>
                <option value="week">Una semana del calendario</option>
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="export-month" className="form-label">Mes de referencia</label>
              <input id="export-month" type="month" className="form-control" value={monthValue} onChange={(event) => { setMonthValue(event.target.value); setWeekIndex('0') }} required />
            </div>
            {mode === 'week' && (
              <div className="col-12 col-md-4">
                <label htmlFor="export-week" className="form-label">Semana del calendario</label>
                <select id="export-week" className="form-select" value={weekIndex} onChange={(event) => setWeekIndex(event.target.value)}>
                  {weeks.map((week, index) => <option key={week.fromDate} value={String(index)}>Semana {index + 1} · {formatShortDate(week.fromDate, true)} – {formatShortDate(week.toDate, true)}</option>)}
                </select>
              </div>
            )}
            <div ref={workerPickerRef} className="col-12 col-md-6 position-relative">
              <label htmlFor="export-worker-search" className="form-label">Trabajador (opcional)</label>
              <input
                id="export-worker-search"
                type="search"
                className="form-control"
                value={workerPickerOpen ? workerSearch : selectedWorkerLabel}
                onFocus={() => { setWorkerSearch(''); setWorkerPickerOpen(true) }}
                onChange={(event) => { setWorkerSearch(event.target.value); setWorkerId(''); setWorkerPickerOpen(true) }}
                placeholder={loadingWorkers ? 'Cargando trabajadores…' : 'Todos los trabajadores · busca por nombre o usuario…'}
                autoComplete="off"
                aria-controls="export-worker-options"
                aria-expanded={workerPickerOpen}
                disabled={loadingWorkers}
              />
              {workerPickerOpen && !loadingWorkers && (
                <div id="export-worker-options" className="list-group position-absolute start-0 end-0 shadow-sm" style={{ zIndex: 1050, top: '100%', maxHeight: '240px', overflowY: 'auto' }}>
                  <button type="button" className={`list-group-item list-group-item-action ${!workerId ? 'active' : ''}`} onClick={() => { setWorkerId(''); setWorkerSearch(''); setWorkerPickerOpen(false) }}>Todos los trabajadores</button>
                  {filteredWorkers.map((worker) => (
                    <button type="button" key={worker.id} className={`list-group-item list-group-item-action ${workerId === worker.id ? 'active' : ''}`} onClick={() => { setWorkerId(worker.id); setWorkerSearch(''); setWorkerPickerOpen(false) }}>
                      {worker.display_name}{worker.active ? '' : ' (inactivo)'}{worker.username ? ` · ${worker.username}` : ''}
                    </button>
                  ))}
                  {filteredWorkers.length === 0 && <div className="list-group-item text-secondary">No hay trabajadores coincidentes.</div>}
                </div>
              )}
            </div>
          </div>

          {interval && (
            <div className="alert alert-light border mt-4 mb-0 d-flex flex-wrap align-items-start gap-3">
              <div className="text-success fs-4" aria-hidden="true">▦</div>
              <div>
                <div className="fw-semibold">Intervalo que se exportará</div>
                <div>{intervalLabel}</div>
                <div className="small text-secondary mt-1">El archivo tendrá tres hojas: resumen por trabajador y día, detalle de cada obra y horarios diarios. El horario de entrada/salida no se suma ni se resta de las horas registradas en las obras.</div>
              </div>
            </div>
          )}
        </div>
        <div className="card-footer bg-white border-0 p-3 p-md-4 d-flex justify-content-end">
          <button type="submit" className="btn btn-success btn-lg" disabled={exporting || loadingWorkers || !interval}>
            {exporting ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Generando Excel…</> : 'Descargar informe Excel'}
          </button>
        </div>
      </form>

      {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
      {notice && <div className="alert alert-success mt-3" role="status">{notice}</div>}
    </main>
  )
}

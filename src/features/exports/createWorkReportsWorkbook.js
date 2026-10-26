const encoder = new TextEncoder()

function xmlEscape(value) {
  // XML 1.0 no admite ciertos caracteres de control, aunque estén escapados.
  const xmlSafeValue = String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
  return xmlSafeValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index) {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function cellXml(cell, reference) {
  const descriptor = cell && typeof cell === 'object' && !Array.isArray(cell)
    ? cell
    : { value: cell }
  const value = descriptor.value
  const style = Number.isInteger(descriptor.style) ? descriptor.style : 0
  if (value === null || value === undefined || value === '') {
    return style ? `<c r="${reference}" s="${style}"/>` : ''
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}

function worksheetXml(sheet) {
  const rows = sheet.rows ?? []
  const maxColumns = Math.max(1, ...rows.map((row) => row.length))
  const lastCell = `${columnName(maxColumns - 1)}${Math.max(rows.length, 1)}`
  const columnsXml = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const pane = sheet.freezePane
    ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.freezePane.xSplit ?? 0}" ySplit="${sheet.freezePane.ySplit ?? 0}" topLeftCell="${sheet.freezePane.topLeftCell}" activePane="${sheet.freezePane.activePane ?? 'bottomRight'}" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const rowsXml = rows.map((row, rowIndex) => {
    const r = rowIndex + 1
    const height = sheet.rowHeights?.[r]
    const attrs = height ? ` ht="${height}" customHeight="1"` : ''
    const cells = row.map((cell, columnIndex) => cellXml(cell, `${columnName(columnIndex)}${r}`)).join('')
    return `<row r="${r}"${attrs}>${cells}</row>`
  }).join('')
  const merges = sheet.merges ?? []
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((reference) => `<mergeCell ref="${reference}"/>`).join('')}</mergeCells>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastCell}"/>${pane}<sheetFormatPr defaultRowHeight="19"/>${columnsXml}<sheetData>${rowsXml}</sheetData>${mergeXml}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><color rgb="FF222222"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="16"/><color rgb="FF17663B"/><name val="Aptos Display"/></font>
    <font><b/><sz val="10"/><color rgb="FF17663B"/><name val="Aptos"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF17663B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2F0E7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD7E2DA"/></left><right style="thin"><color rgb="FFD7E2DA"/></right><top style="thin"><color rgb="FFD7E2DA"/></top><bottom style="thin"><color rgb="FFD7E2DA"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function zipStoredFiles(files) {
  const localParts = []
  const centralParts = []
  let localOffset = 0

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name)
    const dataBytes = typeof content === 'string' ? encoder.encode(content) : content
    const crc = crc32(dataBytes)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const local = new DataView(localHeader.buffer)
    local.setUint32(0, 0x04034B50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, 0, true)
    local.setUint16(12, 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dataBytes.length, true)
    local.setUint32(22, dataBytes.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)
    localParts.push(localHeader, dataBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const central = new DataView(centralHeader.buffer)
    central.setUint32(0, 0x02014B50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, 0, true)
    central.setUint16(14, 0, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, dataBytes.length, true)
    central.setUint32(24, dataBytes.length, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true)
    central.setUint16(32, 0, true)
    central.setUint16(34, 0, true)
    central.setUint16(36, 0, true)
    central.setUint32(38, 0, true)
    central.setUint32(42, localOffset, true)
    centralHeader.set(nameBytes, 46)
    centralParts.push(centralHeader)
    localOffset += localHeader.length + dataBytes.length
  }

  const centralBytes = concatBytes(centralParts)
  const localBytes = concatBytes(localParts)
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054B50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, files.length, true)
  view.setUint16(10, files.length, true)
  view.setUint32(12, centralBytes.length, true)
  view.setUint32(16, localBytes.length, true)
  view.setUint16(20, 0, true)
  return concatBytes([localBytes, centralBytes, end])
}

function buildWorkbookFiles(sheets) {
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const sheetRefs = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const sheetRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetRefs}</sheets><calcPr calcId="191029"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
  ]
  sheets.forEach((sheet, index) => files.push([`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet)]))
  return files
}

export function createWorkReportsWorkbookBytes(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) throw new Error('No hay hojas para exportar.')
  return zipStoredFiles(buildWorkbookFiles(sheets))
}

export function downloadWorkReportsWorkbook({ sheets, filename }) {
  const bytes = createWorkReportsWorkbookBytes(sheets)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename || 'informe-olivillatres.xlsx'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function textCell(value, style = 0) {
  return { value: value ?? '', style }
}

export function numberCell(value, style = 5) {
  return { value: Number(value) || 0, style }
}

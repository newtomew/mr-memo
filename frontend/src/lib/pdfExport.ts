import jsPDF from 'jspdf'
import type { Memo } from './types'

export function exportMemoPdf(memo: Memo) {
  const doc = new jsPDF()
  const margin = 15
  let y = 20

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('mr.memo', margin, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(memo.memoNumber, 200 - margin, y, { align: 'right' })
  y += 10

  doc.setDrawColor(200)
  doc.line(margin, y, 200 - margin, y)
  y += 10

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(memo.subject, margin, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`From: ${memo.author.name}  |  Status: ${memo.status}  |  Priority: ${memo.priority}`, margin, y)
  y += 6
  doc.text(`Created: ${new Date(memo.createdAt).toLocaleDateString()}`, margin, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.text('Body', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  const bodyLines = doc.splitTextToSize(memo.body, 200 - margin * 2)
  doc.text(bodyLines, margin, y)
  y += bodyLines.length * 5 + 8

  if (memo.workflowSteps.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Workflow History', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    for (const step of memo.workflowSteps) {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(`${step.position + 1}. ${step.approver.name} (${step.title || 'Approver'}) — ${step.status}`, margin, y)
      y += 5
      for (const approval of step.approvals) {
        const line = `   "${approval.reason || ''}" — ${new Date(approval.decidedAt).toLocaleString()}`
        doc.text(line, margin, y)
        y += 5
      }
    }
    y += 5
  }

  if (memo.attachments.length > 0) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.text('Attachments', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    for (const att of memo.attachments) {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(`- ${att.fileName} (${(att.fileSize / 1024).toFixed(0)} KB) — uploaded by ${att.uploadedBy.name}`, margin, y)
      y += 5
    }
    y += 5
  }

  if (memo.comments.length > 0) {
    if (y > 250) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.text('Comments', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    for (const c of memo.comments) {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      const lines = doc.splitTextToSize(`${c.author.name}: ${c.content}`, 200 - margin * 2)
      doc.text(lines, margin, y)
      y += lines.length * 5 + 2
    }
  }

  doc.save(`${memo.memoNumber}.pdf`)
}

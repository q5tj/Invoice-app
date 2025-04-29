import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

export const generatePdf = async (invoice: any, settings: any) => {
  // Create a new PDF document
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  // Set text direction based on language
  const isArabic = settings?.language === "ar"
  const textAlign = isArabic ? "right" : "left"
  const dir = isArabic ? "rtl" : "ltr"

  // Add company logo if available
  if (settings?.logoUrl) {
    try {
      // If there's a company logo, add it to the PDF
      doc.addImage(settings.logoUrl, "JPEG", margin, yPos, 50, 20)
      yPos += 25
    } catch (error) {
      console.error("Error adding logo to PDF:", error)
    }
  } else {
    // If no logo, add company name as header
    doc.setFontSize(24)
    doc.text(settings?.companyName || "Company Name", margin, yPos)
    yPos += 15
  }

  // Company details
  doc.setFontSize(10)
  if (settings?.address) {
    doc.text(settings.address, isArabic ? pageWidth - margin : margin, yPos, { align: textAlign })
    yPos += 5
  }
  if (settings?.email) {
    doc.text(
      `${isArabic ? "البريد الإلكتروني: " : "Email: "}${settings.email}`,
      isArabic ? pageWidth - margin : margin,
      yPos,
      { align: textAlign },
    )
    yPos += 5
  }
  if (settings?.phone) {
    doc.text(`${isArabic ? "الهاتف: " : "Phone: "}${settings.phone}`, isArabic ? pageWidth - margin : margin, yPos, {
      align: textAlign,
    })
    yPos += 5
  }
  if (settings?.website) {
    doc.text(
      `${isArabic ? "الموقع الإلكتروني: " : "Website: "}${settings.website}`,
      isArabic ? pageWidth - margin : margin,
      yPos,
      { align: textAlign },
    )
    yPos += 5
  }
  if (settings?.taxNumber) {
    doc.text(
      `${isArabic ? "الرقم الضريبي: " : "Tax Number: "}${settings.taxNumber}`,
      isArabic ? pageWidth - margin : margin,
      yPos,
      { align: textAlign },
    )
    yPos += 5
  }

  yPos += 10

  // Invoice details (right aligned)
  doc.setFontSize(16)
  doc.text(isArabic ? "فاتورة" : "INVOICE", isArabic ? margin : pageWidth - margin, yPos, {
    align: isArabic ? "left" : "right",
  })
  yPos += 10

  doc.setFontSize(10)
  doc.text(
    `${isArabic ? "رقم الفاتورة: " : "Invoice Number: "}${invoice.invoiceNumber}`,
    isArabic ? margin : pageWidth - margin,
    yPos,
    { align: isArabic ? "left" : "right" },
  )
  yPos += 5

  // Format dates
  const formatDate = (date: any) => {
    if (!date) return "N/A"
    try {
      const d = date.toDate ? date.toDate() : new Date(date)
      return d.toLocaleDateString(isArabic ? "ar-SA" : "en-US")
    } catch (error) {
      return "Invalid Date"
    }
  }

  doc.text(
    `${isArabic ? "التاريخ: " : "Date: "}${formatDate(invoice.date)}`,
    isArabic ? margin : pageWidth - margin,
    yPos,
    { align: isArabic ? "left" : "right" },
  )
  yPos += 5
  doc.text(
    `${isArabic ? "تاريخ الاستحقاق: " : "Due Date: "}${formatDate(invoice.dueDate)}`,
    isArabic ? margin : pageWidth - margin,
    yPos,
    { align: isArabic ? "left" : "right" },
  )
  yPos += 15

  // Client information
  doc.setFontSize(12)
  doc.text(isArabic ? "فاتورة إلى:" : "Bill To:", isArabic ? pageWidth - margin : margin, yPos, { align: textAlign })
  yPos += 6
  doc.setFontSize(10)
  doc.text(invoice.clientName, isArabic ? pageWidth - margin : margin, yPos, { align: textAlign })
  yPos += 5
  if (invoice.clientAddress) {
    doc.text(invoice.clientAddress, isArabic ? pageWidth - margin : margin, yPos, { align: textAlign })
    yPos += 5
  }
  if (invoice.clientEmail) {
    doc.text(
      `${isArabic ? "البريد الإلكتروني: " : "Email: "}${invoice.clientEmail}`,
      isArabic ? pageWidth - margin : margin,
      yPos,
      { align: textAlign },
    )
    yPos += 5
  }

  yPos += 10

  // Invoice items table
  const tableColumns = [
    { header: isArabic ? "البند" : "Item", dataKey: "description" },
    { header: isArabic ? "الكمية" : "Quantity", dataKey: "quantity" },
    { header: isArabic ? "السعر" : "Price", dataKey: "price" },
    { header: isArabic ? "المجموع" : "Total", dataKey: "total" },
  ]

  // Format currency based on settings
  const currency = settings?.currency || "USD"
  const currencySymbol = getCurrencySymbol(currency)

  const tableRows = invoice.items.map((item: any) => ({
    description: item.description,
    quantity: item.quantity,
    price: formatCurrency(item.price, currency, currencySymbol),
    total: formatCurrency(item.total || item.quantity * item.price, currency, currencySymbol),
  }))

  try {
    // Use autoTable as a function instead of a method on doc
    autoTable(doc, {
      startY: yPos,
      head: [tableColumns.map((col) => col.header)],
      body: tableRows.map((row) => tableColumns.map((col) => row[col.dataKey as keyof typeof row])),
      margin: { left: margin, right: margin },
      styles: { overflow: "linebreak", font: "helvetica", halign: isArabic ? "right" : "left" },
      headStyles: { fillColor: [75, 85, 99] },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" },
      },
    })
  } catch (error) {
    console.error("Error generating table:", error)
    // Fallback if autoTable fails
    yPos += 10
    doc.text("Error generating table. Please check console for details.", margin, yPos)
    yPos += 20
  }

  // Get the Y position after the table
  yPos = (doc as any).lastAutoTable?.finalY + 10 || yPos + 50

  // Summary (right aligned)
  const summaryX = isArabic ? margin : pageWidth - margin - 70
  const summaryWidth = 70

  // Draw summary box
  doc.setFillColor(240, 240, 240)
  doc.rect(summaryX, yPos, summaryWidth, 15 * 3, "F")

  // Subtotal
  doc.text(
    isArabic ? "المجموع الفرعي:" : "Subtotal:",
    isArabic ? summaryX + summaryWidth - 5 : summaryX + 5,
    yPos + 10,
    { align: isArabic ? "right" : "left" },
  )
  doc.text(
    formatCurrency(invoice.subtotal, currency, currencySymbol),
    isArabic ? summaryX + 5 : summaryX + summaryWidth - 5,
    yPos + 10,
    { align: isArabic ? "left" : "right" },
  )

  // Tax
  doc.text(
    `${isArabic ? "الضريبة" : "Tax"} (${invoice.taxRate}%):`,
    isArabic ? summaryX + summaryWidth - 5 : summaryX + 5,
    yPos + 20,
    { align: isArabic ? "right" : "left" },
  )
  doc.text(
    formatCurrency(invoice.tax, currency, currencySymbol),
    isArabic ? summaryX + 5 : summaryX + summaryWidth - 5,
    yPos + 20,
    { align: isArabic ? "left" : "right" },
  )

  // Total
  doc.setFontSize(12)
  doc.text(isArabic ? "المجموع:" : "Total:", isArabic ? summaryX + summaryWidth - 5 : summaryX + 5, yPos + 30, {
    align: isArabic ? "right" : "left",
  })
  doc.text(
    formatCurrency(invoice.totalAmount, currency, currencySymbol),
    isArabic ? summaryX + 5 : summaryX + summaryWidth - 5,
    yPos + 30,
    { align: isArabic ? "left" : "right" },
  )

  yPos += 45

  // Notes
  if (invoice.notes) {
    doc.setFontSize(10)
    doc.text(isArabic ? "ملاحظات:" : "Notes:", isArabic ? pageWidth - margin : margin, yPos, { align: textAlign })
    yPos += 5
    // Handle notes text
    doc.text(invoice.notes, isArabic ? pageWidth - margin : margin, yPos, {
      align: textAlign,
      maxWidth: pageWidth - margin * 2,
    })

    // Calculate how much space the notes take up
    const textLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2)
    yPos += textLines.length * 5 + 10
  }

  // Terms and conditions
  if (settings?.termsAndConditions) {
    doc.setFontSize(10)
    doc.text(isArabic ? "الشروط والأحكام:" : "Terms and Conditions:", isArabic ? pageWidth - margin : margin, yPos, {
      align: textAlign,
    })
    yPos += 5
    // Handle terms text
    doc.text(settings.termsAndConditions, isArabic ? pageWidth - margin : margin, yPos, {
      align: textAlign,
      maxWidth: pageWidth - margin * 2,
    })
  }

  // Footer
  doc.setFontSize(8)
  doc.text(
    isArabic ? `تم إنشاؤها في ${new Date().toLocaleString("ar-SA")}` : `Generated on ${new Date().toLocaleString()}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" },
  )

  // Save the PDF with language indicator
  doc.save(`Invoice-${invoice.invoiceNumber}-${isArabic ? "AR" : "EN"}.pdf`)
}

// Helper function to get currency symbol
const getCurrencySymbol = (currency: string): string => {
  switch (currency) {
    case "SAR":
      return "ر.س"
    case "USD":
      return "$"
    case "EUR":
      return "€"
    case "GBP":
      return "£"
    default:
      return "$"
  }
}

const formatCurrency = (amount: number, currency: string, symbol: string) => {
  return `${symbol} ${amount.toFixed(2)}`
}

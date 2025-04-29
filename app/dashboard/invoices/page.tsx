"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth, db } from "@/lib/firebase"
import { collection, getDocs, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import {
  MoreHorizontal,
  PlusCircle,
  FileIcon as FilePdf,
  Printer,
  Edit,
  Trash,
  Check,
  Clock,
  Search,
  CheckCircle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { generatePdf } from "@/lib/pdf-helpers"

type Invoice = {
  id: string
  invoiceNumber: string
  clientName: string
  date: any
  dueDate: any
  totalAmount: number
  status: "draft" | "pending" | "paid"
  items: Array<{
    description: string
    quantity: number
    price: number
  }>
  notes?: string
  createdAt: any
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const user = auth.currentUser
        if (!user) return

        const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"))

        const querySnapshot = await getDocs(q)
        const fetchedInvoices = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Invoice[]

        setInvoices(fetchedInvoices)
        setFilteredInvoices(fetchedInvoices)
      } catch (error) {
        console.error("Error fetching invoices:", error)
        toast({
          title: "Error",
          description: "Failed to load invoices.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [toast])

  useEffect(() => {
    // Filter invoices based on search query and status filter
    let result = [...invoices]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (invoice) =>
          invoice.invoiceNumber?.toLowerCase().includes(query) || invoice.clientName?.toLowerCase().includes(query),
      )
    }

    if (statusFilter !== "all") {
      result = result.filter((invoice) => invoice.status === statusFilter)
    }

    setFilteredInvoices(result)
  }, [searchQuery, statusFilter, invoices])

  const handleDeleteInvoice = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      try {
        await deleteDoc(doc(db, "invoices", id))
        setInvoices((prevInvoices) => prevInvoices.filter((invoice) => invoice.id !== id))
        toast({
          title: "Invoice deleted",
          description: "The invoice has been successfully deleted.",
        })
      } catch (error) {
        console.error("Error deleting invoice:", error)
        toast({
          title: "Error",
          description: "Failed to delete invoice.",
          variant: "destructive",
        })
      }
    }
  }

  const handleMarkAsPaid = async (id: string) => {
    try {
      await updateDoc(doc(db, "invoices", id), {
        status: "paid",
      })

      setInvoices((prevInvoices) =>
        prevInvoices.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" as const } : invoice)),
      )

      toast({
        title: "Status updated",
        description: "Invoice has been marked as paid.",
      })
    } catch (error) {
      console.error("Error updating invoice status:", error)
      toast({
        title: "Error",
        description: "Failed to update invoice status.",
        variant: "destructive",
      })
    }
  }

  const handleGeneratePdf = async (invoice: Invoice) => {
    try {
      const settingsDoc = await getDocs(query(collection(db, "settings")))
      const settings = settingsDoc.docs[0]?.data() || {}

      await generatePdf(invoice, settings)

      toast({
        title: "PDF Generated",
        description: "Invoice PDF has been generated and downloaded.",
      })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast({
        title: "Error",
        description: "Failed to generate PDF.",
        variant: "destructive",
      })
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date)
    } catch (error) {
      return "Invalid date"
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle className="mr-1 h-3 w-3" />
            Paid
          </Badge>
        )
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case "draft":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            Draft
          </Badge>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Manage your invoices and track payments</p>
        </div>
        <Button onClick={() => router.push("/dashboard/invoices/new")}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Invoice
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices List</CardTitle>
          <CardDescription>View, manage, and generate PDFs for your invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredInvoices.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                    <TableHead className="hidden md:table-cell">Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.invoiceNumber || `INV-${invoice.id.substring(0, 6)}`}
                      </TableCell>
                      <TableCell>{invoice.clientName || "N/A"}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDate(invoice.date)}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDate(invoice.dueDate)}</TableCell>
                      <TableCell>{formatCurrency(invoice.totalAmount || 0)}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/dashboard/invoices/${invoice.id}`)}>
                              <Edit className="mr-2 h-4 w-4" />
                              View & Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGeneratePdf(invoice)}>
                              <FilePdf className="mr-2 h-4 w-4" />
                              Generate PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGeneratePdf(invoice)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print
                            </DropdownMenuItem>
                            {invoice.status !== "paid" && (
                              <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice.id)}>
                                <Check className="mr-2 h-4 w-4" />
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteInvoice(invoice.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-3">
                <FilePdf className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No invoices found</h3>
              <p className="mb-4 mt-2 text-sm text-muted-foreground max-w-sm">
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search or filter criteria."
                  : "You haven't created any invoices yet. Get started by creating your first invoice."}
              </p>
              {!searchQuery && statusFilter === "all" && (
                <Button onClick={() => router.push("/dashboard/invoices/new")}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

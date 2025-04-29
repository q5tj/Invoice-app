"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { doc, updateDoc, Timestamp, getDoc, getDocs, query, collection } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { format } from "date-fns"
import { CalendarIcon, Plus, Trash, Save, FileIcon as FilePdf, ArrowLeft, Package } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
  emptyInvoiceItem,
  calculateInvoiceTotals,
  safelyConvertToDate,
  getProducts,
  type Product,
} from "@/lib/invoice-helpers"
import { generatePdf } from "@/lib/pdf-helpers"

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, { message: "Invoice number is required" }),
  date: z.date({ required_error: "Invoice date is required" }),
  dueDate: z.date({ required_error: "Due date is required" }),
  clientName: z.string().min(1, { message: "Client name is required" }),
  clientEmail: z.string().email({ message: "Please enter a valid email" }).optional().or(z.literal("")),
  clientAddress: z.string().optional().or(z.literal("")),
  taxRate: z.coerce.number().min(0).default(0),
  status: z.enum(["draft", "pending", "paid"]).default("pending"),
  items: z
    .array(
      z.object({
        id: z.string(),
        description: z.string().min(1, { message: "Description is required" }),
        quantity: z.coerce.number().positive({ message: "Quantity must be positive" }),
        price: z.coerce.number().min(0, { message: "Price must be non-negative" }),
        total: z.coerce.number(),
      }),
    )
    .min(1, { message: "Add at least one item" }),
  notes: z.string().optional().or(z.literal("")),
  terms: z.string().optional().or(z.literal("")),
  subtotal: z.number(),
  tax: z.number(),
  totalAmount: z.number(),
})

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>

export default function EditInvoicePage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [companySettings, setCompanySettings] = useState<any>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const { id } = params

  // Use a ref to track if we're in the middle of calculating totals
  const isCalculatingTotals = useRef(false)

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: "",
      date: new Date(),
      dueDate: new Date(),
      clientName: "",
      clientEmail: "",
      clientAddress: "",
      taxRate: 0,
      status: "pending",
      items: [emptyInvoiceItem()],
      notes: "",
      terms: "",
      subtotal: 0,
      tax: 0,
      totalAmount: 0,
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  })

  // Watch for changes to calculate totals
  const watchedItems = form.watch("items")
  const watchedTaxRate = form.watch("taxRate")

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        // Fetch invoice data directly from Firestore
        const invoiceDoc = await getDoc(doc(db, "invoices", id))

        if (!invoiceDoc.exists()) {
          toast({
            title: "Invoice Not Found",
            description: "The requested invoice could not be found.",
            variant: "destructive",
          })
          router.push("/dashboard/invoices")
          return
        }

        const invoiceData = invoiceDoc.data()

        // Fetch company settings
        const settingsSnapshot = await getDocs(query(collection(db, "settings")))
        const settings = settingsSnapshot.docs[0]?.data() || {}
        setCompanySettings(settings)

        // Fetch products
        const productsList = await getProducts()
        setProducts(productsList)

        // Safely convert dates
        const formattedInvoice = {
          ...invoiceData,
          id: invoiceDoc.id,
          date: safelyConvertToDate(invoiceData.date),
          dueDate: safelyConvertToDate(invoiceData.dueDate),
          // Ensure items have the correct structure
          items: Array.isArray(invoiceData.items)
            ? invoiceData.items.map((item: any) => ({
                id: item.id || crypto.randomUUID(),
                description: item.description || "",
                quantity: Number(item.quantity) || 1,
                price: Number(item.price) || 0,
                total: Number(item.total) || 0,
              }))
            : [emptyInvoiceItem()],
          // Ensure numeric values
          taxRate: Number(invoiceData.taxRate) || 0,
          subtotal: Number(invoiceData.subtotal) || 0,
          tax: Number(invoiceData.tax) || 0,
          totalAmount: Number(invoiceData.totalAmount) || 0,
          // Ensure string values are not undefined
          clientAddress: invoiceData.clientAddress || "",
          clientEmail: invoiceData.clientEmail || "",
          notes: invoiceData.notes || "",
          terms: invoiceData.terms || "",
        }

        // Reset the form with the invoice data
        form.reset(formattedInvoice)
      } catch (error) {
        console.error("Error fetching invoice:", error)
        toast({
          title: "Error",
          description: "Failed to load invoice. Please try again.",
          variant: "destructive",
        })
        // Redirect to invoices list on error
        router.push("/dashboard/invoices")
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchInvoice()
    }
  }, [id, form, router, toast])

  // Calculate totals when items or tax rate change
  useEffect(() => {
    // Prevent infinite loops by checking if we're already calculating
    if (isCalculatingTotals.current) return

    if (watchedItems && watchedItems.length > 0) {
      isCalculatingTotals.current = true

      try {
        // First update each line item total
        const updatedItems = watchedItems.map((item) => ({
          ...item,
          total: item.quantity * item.price,
        }))

        // Then update the invoice totals
        const { subtotal, tax, totalAmount } = calculateInvoiceTotals(updatedItems, watchedTaxRate)

        // Batch the updates to avoid multiple re-renders
        form.setValue("subtotal", subtotal, { shouldDirty: true })
        form.setValue("tax", tax, { shouldDirty: true })
        form.setValue("totalAmount", totalAmount, { shouldDirty: true })

        // Only update items if totals have changed
        const itemsNeedUpdate = updatedItems.some((item, index) => item.total !== watchedItems[index]?.total)

        if (itemsNeedUpdate) {
          form.setValue("items", updatedItems, { shouldDirty: true })
        }
      } finally {
        // Always reset the flag when done
        isCalculatingTotals.current = false
      }
    }
  }, [watchedItems, watchedTaxRate, form])

  // Helper function to clean data for Firestore
  const cleanDataForFirestore = (data: any) => {
    const cleanedData: Record<string, any> = {}

    // Process each field to ensure it's Firestore-compatible
    Object.entries(data).forEach(([key, value]) => {
      // Skip undefined values
      if (value === undefined) return

      // Convert empty strings to null for optional text fields
      if (
        typeof value === "string" &&
        value.trim() === "" &&
        ["clientAddress", "clientEmail", "notes", "terms"].includes(key)
      ) {
        cleanedData[key] = null
      } else {
        cleanedData[key] = value
      }
    })

    return cleanedData
  }

  const onSubmit = async (data: InvoiceFormValues) => {
    setSubmitting(true)
    try {
      const user = auth.currentUser
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You mustt be logged in to update an invoice.",
          variant: "destructive",
        })
        return
      }

      // Prepare the invoice data with date conversions
      const rawInvoiceData = {
        ...data,
        date: Timestamp.fromDate(data.date),
        dueDate: Timestamp.fromDate(data.dueDate),
        updatedAt: Timestamp.now(),
      }

      // Clean the data to ensure it's Firestore-compatible
      const invoiceData = cleanDataForFirestore(rawInvoiceData)

      // Update the invoice in Firestore
      await updateDoc(doc(db, "invoices", id), invoiceData)

      toast({
        title: "Invoice Updated",
        description: `Invoice ${data.invoiceNumber} has been updated successfully.`,
      })

      // Stay on the same page
    } catch (error) {
      console.error("Error updating invoice:", error)
      toast({
        title: "Error",
        description: "Failed to update invoice. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const addItem = () => {
    append(emptyInvoiceItem())
  }

  const removeItem = (index: number) => {
    if (fields.length > 1) {
      remove(index)
    } else {
      toast({
        title: "Cannot Remove Item",
        description: "Invoice must have at least one item.",
        variant: "destructive",
      })
    }
  }

  const handleAddProduct = (index: number, product: Product) => {
    update(index, {
      ...fields[index],
      description: product.name,
      price: product.price,
      total: product.price * fields[index].quantity,
    })
    setIsProductDialogOpen(false)
  }

  const openProductDialog = (index: number) => {
    setSelectedItemIndex(index)
    setIsProductDialogOpen(true)
  }

  const handleGeneratePdf = async () => {
    try {
      const formValues = form.getValues()

      // Format dates for PDF
      const invoiceForPdf = {
        ...formValues,
        date: formValues.date,
        dueDate: formValues.dueDate,
      }

      await generatePdf(invoiceForPdf, companySettings)

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

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/invoices")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Edit Invoice {form.watch("invoiceNumber")}</h1>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleGeneratePdf}>
            <FilePdf className="mr-2 h-4 w-4" />
            Generate PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
          <CardDescription>Edit your invoice information</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {/* Invoice Information */}
              <div className="grid gap-6 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name="invoiceNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly />
                      </FormControl>
                      <FormDescription>Auto-generated sequential invoice number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Invoice Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Client Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Client Information</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="clientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Client or Company Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="client@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientAddress"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Client Address</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Client's billing address" className="resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Invoice Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Invoice Items</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>

                <div className="rounded-md border">
                  <div className="grid grid-cols-12 gap-2 border-b bg-muted/50 p-3 text-sm font-medium">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-2">Price</div>
                    <div className="col-span-1">Total</div>
                    <div className="col-span-2"></div>
                  </div>

                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 p-3">
                      <div className="col-span-5">
                        <FormField
                          control={form.control}
                          name={`items.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Item description" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" min="1" step="1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.price`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" min="0" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-1 flex items-center">
                        {formatCurrency(watchedItems[index]?.total || 0)}
                      </div>
                      <div className="col-span-2 flex items-center justify-end space-x-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openProductDialog(index)}>
                          <Package className="mr-2 h-4 w-4" />
                          Select Product
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                          <Trash className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals & Tax */}
              <div className="flex justify-end">
                <div className="w-full max-w-md space-y-4">
                  <div className="flex justify-between">
                    <div className="text-sm">Subtotal:</div>
                    <div>{formatCurrency(form.watch("subtotal"))}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm">Tax Rate:</div>
                      <FormField
                        control={form.control}
                        name="taxRate"
                        render={({ field }) => (
                          <FormItem className="w-16">
                            <FormControl>
                              <Input type="number" min="0" step="0.1" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="text-sm">%</div>
                    </div>
                    <div>{formatCurrency(form.watch("tax"))}</div>
                  </div>
                  <div className="flex justify-between border-t pt-4 font-medium">
                    <div>Total:</div>
                    <div className="text-lg">{formatCurrency(form.watch("totalAmount"))}</div>
                  </div>
                </div>
              </div>

              {/* Notes & Terms */}
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Notes for client (optional)"
                          className="min-h-32 resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms & Conditions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Terms and conditions (optional)"
                          className="min-h-32 resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>This will appear at the bottom of your invoice</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/invoices")}>
                Cancel
              </Button>
              <div className="flex space-x-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* Product Selection Dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Select a Product</DialogTitle>
            <DialogDescription>Choose a product from your catalog to add to this invoice.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {products.length > 0 ? (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => selectedItemIndex !== null && handleAddProduct(selectedItemIndex, product)}
                  >
                    <div>
                      <h4 className="font-medium">{product.name}</h4>
                      <p className="text-sm text-muted-foreground">{product.description}</p>
                    </div>
                    <div className="font-medium">{formatCurrency(product.price)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No products found</h3>
                <p className="mt-2 text-sm text-muted-foreground">Add products in the Products section first.</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setIsProductDialogOpen(false)
                    router.push("/dashboard/products")
                  }}
                >
                  Go to Products
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

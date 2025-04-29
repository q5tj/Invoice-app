import { db } from "./firebase"
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore"

export type InvoiceItem = {
  id: string
  description: string
  quantity: number
  price: number
  total: number
}

export type Invoice = {
  id?: string
  invoiceNumber: string
  date: Date
  dueDate: Date
  clientName: string
  clientEmail: string
  clientAddress?: string
  status: "draft" | "pending" | "paid"
  items: InvoiceItem[]
  subtotal: number
  tax: number
  taxRate: number
  totalAmount: number
  notes?: string
  terms?: string
  createdAt?: Date
  updatedAt?: Date
}

export type Product = {
  id?: string
  name: string
  description: string
  price: number
  sku?: string
  createdAt?: Date
  updatedAt?: Date
}

export const emptyInvoiceItem = (): InvoiceItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  price: 0,
  total: 0,
})

export const emptyProduct = (): Product => ({
  name: "",
  description: "",
  price: 0,
  sku: "",
})

export const calculateInvoiceTotals = (items: InvoiceItem[], taxRate = 0) => {
  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0)
  const tax = subtotal * (taxRate / 100)
  const totalAmount = subtotal + tax

  return {
    subtotal,
    tax,
    totalAmount,
  }
}

export const getNextInvoiceNumber = async (): Promise<string> => {
  try {
    // First, check the settings for the next invoice number
    const settingsQuery = query(collection(db, "settings"))
    const settingsSnapshot = await getDocs(settingsQuery)

    if (!settingsSnapshot.empty) {
      const settingsDoc = settingsSnapshot.docs[0]
      const settings = settingsDoc.data()

      if (settings?.nextInvoiceNumber) {
        return `INV-${settings.nextInvoiceNumber.toString().padStart(4, "0")}`
      }
    }

    // Fall back to getting the highest invoice number from existing invoices
    const invoicesQuery = query(collection(db, "invoices"), orderBy("invoiceNumber", "desc"), limit(1))

    const invoicesSnapshot = await getDocs(invoicesQuery)

    if (!invoicesSnapshot.empty) {
      const lastInvoice = invoicesSnapshot.docs[0].data()
      const lastInvoiceNumber = lastInvoice.invoiceNumber

      if (lastInvoiceNumber && lastInvoiceNumber.startsWith("INV-")) {
        const numberPart = Number.parseInt(lastInvoiceNumber.replace("INV-", ""), 10)
        if (!isNaN(numberPart)) {
          return `INV-${(numberPart + 1).toString().padStart(4, "0")}`
        }
      }
    }

    // Default fallback
    return "INV-0001"
  } catch (error) {
    console.error("Error getting next invoice number:", error)
    return "INV-0001"
  }
}

export const getCompanySettings = async () => {
  try {
    const settingsQuery = query(collection(db, "settings"))
    const settingsSnapshot = await getDocs(settingsQuery)

    if (!settingsSnapshot.empty) {
      return settingsSnapshot.docs[0].data()
    }

    return null
  } catch (error) {
    console.error("Error getting company settings:", error)
    return null
  }
}

// Helper function to safely convert Firestore timestamp to Date
export const safelyConvertToDate = (timestamp: any): Date => {
  if (!timestamp) return new Date()

  try {
    // If it's a Firestore timestamp with toDate method
    if (timestamp.toDate && typeof timestamp.toDate === "function") {
      return timestamp.toDate()
    }

    // If it's a date string or timestamp number
    const date = new Date(timestamp)

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.warn("Invalid date detected, using current date as fallback")
      return new Date()
    }

    return date
  } catch (error) {
    console.error("Error converting timestamp to date:", error)
    return new Date()
  }
}

export const getInvoiceById = async (id: string) => {
  try {
    const invoiceDoc = await getDoc(doc(db, "invoices", id))

    if (invoiceDoc.exists()) {
      const data = invoiceDoc.data()

      return {
        id: invoiceDoc.id,
        ...data,
        // Safely convert dates
        date: safelyConvertToDate(data.date),
        dueDate: safelyConvertToDate(data.dueDate),
        createdAt: data.createdAt ? safelyConvertToDate(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? safelyConvertToDate(data.updatedAt) : new Date(),
        // Ensure items have the correct structure
        items: Array.isArray(data.items)
          ? data.items.map((item: any) => ({
              id: item.id || crypto.randomUUID(),
              description: item.description || "",
              quantity: Number(item.quantity) || 1,
              price: Number(item.price) || 0,
              total: Number(item.total) || 0,
            }))
          : [emptyInvoiceItem()],
      } as Invoice
    }

    return null
  } catch (error) {
    console.error("Error getting invoice:", error)
    return null
  }
}

// Products CRUD operations
export const getProducts = async (): Promise<Product[]> => {
  try {
    const productsQuery = query(collection(db, "products"), orderBy("name"))
    const productsSnapshot = await getDocs(productsQuery)

    return productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt ? safelyConvertToDate(doc.data().createdAt) : new Date(),
      updatedAt: doc.data().updatedAt ? safelyConvertToDate(doc.data().updatedAt) : new Date(),
    })) as Product[]
  } catch (error) {
    console.error("Error getting products:", error)
    return []
  }
}

export const getProductById = async (id: string): Promise<Product | null> => {
  try {
    const productDoc = await getDoc(doc(db, "products", id))

    if (productDoc.exists()) {
      const data = productDoc.data()
      return {
        id: productDoc.id,
        ...data,
        createdAt: data.createdAt ? safelyConvertToDate(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? safelyConvertToDate(data.updatedAt) : new Date(),
      } as Product
    }

    return null
  } catch (error) {
    console.error("Error getting product:", error)
    return null
  }
}

export const createProduct = async (product: Product): Promise<string | null> => {
  try {
    const productData = {
      ...product,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const docRef = await addDoc(collection(db, "products"), productData)
    return docRef.id
  } catch (error) {
    console.error("Error creating product:", error)
    return null
  }
}

export const updateProduct = async (id: string, product: Partial<Product>): Promise<boolean> => {
  try {
    const productData = {
      ...product,
      updatedAt: new Date(),
    }

    await updateDoc(doc(db, "products", id), productData)
    return true
  } catch (error) {
    console.error("Error updating product:", error)
    return false
  }
}

export const deleteProduct = async (id: string): Promise<boolean> => {
  try {
    await deleteDoc(doc(db, "products", id))
    return true
  } catch (error) {
    console.error("Error deleting product:", error)
    return false
  }
}

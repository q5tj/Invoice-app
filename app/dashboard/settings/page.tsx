"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { auth, db, storage } from "@/lib/firebase"
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { ImageIcon, Loader } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const settingsFormSchema = z.object({
  companyName: z.string().min(1, {
    message: "Company name is required.",
  }),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  website: z
    .string()
    .url({
      message: "Please enter a valid URL.",
    })
    .optional(),
  termsAndConditions: z.string().optional(),
  nextInvoiceNumber: z.coerce.number().int().positive({
    message: "Next invoice number must be a positive integer.",
  }),
  currency: z.string().default("USD"),
  language: z.string().default("en"),
})

type SettingsFormValues = z.infer<typeof settingsFormSchema>

// Translations for the UI
const translations = {
  en: {
    companySettings: "Company Settings",
    manageCompanyInfo: "Manage your company information and preferences.",
    companyInformation: "Company Information",
    invoiceSettings: "Invoice Settings",
    appearOnInvoices: "This information will appear on your invoices.",
    companyLogo: "Company Logo",
    changeLogo: "Change Logo",
    uploadLogo: "Upload Logo",
    logoRequirements: "PNG, JPG or GIF. Max 2MB.",
    companyName: "Company Name",
    taxNumber: "Tax Number",
    email: "Email",
    phone: "Phone",
    website: "Website",
    nextInvoiceNumber: "Next Invoice Number",
    invoiceNumberDescription: "Invoices will be numbered sequentially starting from this number.",
    address: "Address",
    termsAndConditions: "Terms and Conditions",
    termsDescription: "These terms will be included at the bottom of your invoices.",
    currency: "Currency",
    language: "Language",
    english: "English",
    arabic: "Arabic",
    saveSettings: "Save Settings",
    general: "General",
    appearance: "Appearance",
    currencySymbol: "Currency Symbol",
    languagePreference: "Language Preference",
    languageDescription: "Choose the default language for your invoices.",
    currencyDescription: "Choose the default currency for your invoices.",
  },
  ar: {
    companySettings: "إعدادات الشركة",
    manageCompanyInfo: "إدارة معلومات وتفضيلات شركتك.",
    companyInformation: "معلومات الشركة",
    invoiceSettings: "إعدادات الفاتورة",
    appearOnInvoices: "ستظهر هذه المعلومات على فواتيرك.",
    companyLogo: "شعار الشركة",
    changeLogo: "تغيير الشعار",
    uploadLogo: "تحميل الشعار",
    logoRequirements: "PNG أو JPG أو GIF. الحد الأقصى 2 ميجابايت.",
    companyName: "اسم الشركة",
    taxNumber: "الرقم الضريبي",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    website: "الموقع الإلكتروني",
    nextInvoiceNumber: "رقم الفاتورة التالي",
    invoiceNumberDescription: "سيتم ترقيم الفواتير بالتسلسل بدءًا من هذا الرقم.",
    address: "العنوان",
    termsAndConditions: "الشروط والأحكام",
    termsDescription: "سيتم تضمين هذه الشروط في أسفل فواتيرك.",
    currency: "العملة",
    language: "اللغة",
    english: "الإنجليزية",
    arabic: "العربية",
    saveSettings: "حفظ الإعدادات",
    general: "عام",
    appearance: "المظهر",
    currencySymbol: "رمز العملة",
    languagePreference: "تفضيل اللغة",
    languageDescription: "اختر اللغة الافتراضية لفواتيرك.",
    currencyDescription: "اختر العملة الافتراضية لفواتيرك.",
  },
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [currentLanguage, setCurrentLanguage] = useState<"en" | "ar">("en")
  const { toast } = useToast()
  const t = translations[currentLanguage]

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      companyName: "",
      taxNumber: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      termsAndConditions: "",
      nextInvoiceNumber: 1001,
      currency: "USD",
      language: "en",
    },
  })

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const user = auth.currentUser
        if (!user) return

        const settingsDoc = await getDoc(doc(db, "settings", user.uid))
        if (settingsDoc.exists()) {
          const data = settingsDoc.data()
          form.reset({
            companyName: data.companyName || "",
            taxNumber: data.taxNumber || "",
            address: data.address || "",
            phone: data.phone || "",
            email: data.email || "",
            website: data.website || "",
            termsAndConditions: data.termsAndConditions || "",
            nextInvoiceNumber: data.nextInvoiceNumber || 1001,
            currency: data.currency || "USD",
            language: data.language || "en",
          })
          setLogoUrl(data.logoUrl || null)
          setCurrentLanguage(data.language === "ar" ? "ar" : "en")
        }
      } catch (error) {
        console.error("Error fetching settings:", error)
        toast({
          title: "Error",
          description: "Failed to load company settings.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [form, toast])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0])
      // Create a preview
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          setLogoUrl(event.target.result as string)
        }
      }
      reader.readAsDataURL(e.target.files[0])
    }
  }

  const uploadLogo = async (userId: string) => {
    if (!logoFile) return null

    setUploading(true)
    try {
      const storageRef = ref(storage, `logos/${userId}/${logoFile.name}`)
      await uploadBytes(storageRef, logoFile)
      const downloadUrl = await getDownloadURL(storageRef)
      setUploading(false)
      return downloadUrl
    } catch (error) {
      console.error("Error uploading logo:", error)
      setUploading(false)
      return null
    }
  }

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      const user = auth.currentUser
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to save settings.",
          variant: "destructive",
        })
        return
      }

      let newLogoUrl = logoUrl
      if (logoFile) {
        const uploadedUrl = await uploadLogo(user.uid)
        if (uploadedUrl) {
          newLogoUrl = uploadedUrl
        }
      }

      const settingsRef = doc(db, "settings", user.uid)
      const settingsDoc = await getDoc(settingsRef)

      // Update the current language
      setCurrentLanguage(data.language === "ar" ? "ar" : "en")

      if (settingsDoc.exists()) {
        await updateDoc(settingsRef, {
          ...data,
          logoUrl: newLogoUrl,
          updatedAt: new Date(),
        })
      } else {
        await setDoc(settingsRef, {
          ...data,
          logoUrl: newLogoUrl,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      toast({
        title: currentLanguage === "ar" ? "تم حفظ الإعدادات" : "Settings Saved",
        description:
          currentLanguage === "ar"
            ? "تم حفظ إعدادات شركتك بنجاح."
            : "Your company settings have been saved successfully.",
      })

      // Reset the logo file to prevent re-uploading
      setLogoFile(null)
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        title: currentLanguage === "ar" ? "خطأ" : "Error",
        description:
          currentLanguage === "ar"
            ? "فشل حفظ الإعدادات. يرجى المحاولة مرة أخرى."
            : "Failed to save settings. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleLanguageChange = (value: string) => {
    setCurrentLanguage(value === "ar" ? "ar" : "en")
    form.setValue("language", value)
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={currentLanguage === "ar" ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.companySettings}</h1>
        <p className="text-muted-foreground">{t.manageCompanyInfo}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.companyInformation}</CardTitle>
          <CardDescription>{t.appearOnInvoices}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Tabs defaultValue="general">
              <TabsList className="mx-6 mt-2">
                <TabsTrigger value="general">{t.general}</TabsTrigger>
                <TabsTrigger value="appearance">{t.appearance}</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <CardContent className="space-y-6">
                  {/* Company Logo */}
                  <div className="space-y-4">
                    <div className="flex flex-col items-center justify-center space-y-2 sm:flex-row sm:space-x-4 sm:space-y-0">
                      <div className="relative h-32 w-32 overflow-hidden rounded-lg border">
                        {logoUrl ? (
                          <div className="h-full w-full flex items-center justify-center bg-gray-100">
                            <img
                              src={logoUrl || "/placeholder.svg"}
                              alt="Company logo preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                            <ImageIcon className="h-12 w-12" />
                          </div>
                        )}
                        {uploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                            <Loader className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-center sm:items-start">
                        <Button type="button" variant="outline" className="relative" disabled={uploading}>
                          <input
                            type="file"
                            accept="image/*"
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            onChange={handleLogoChange}
                            disabled={uploading}
                          />
                          {logoUrl ? t.changeLogo : t.uploadLogo}
                        </Button>
                        <p className="mt-2 text-xs text-muted-foreground">{t.logoRequirements}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.companyName}</FormLabel>
                          <FormControl>
                            <Input placeholder={currentLanguage === "ar" ? "اسم شركتك" : "Your Company"} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="taxNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.taxNumber}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={
                                currentLanguage === "ar"
                                  ? "رقم الضريبة / رقم ضريبة القيمة المضافة"
                                  : "Tax ID / VAT Number"
                              }
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.email}</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contact@yourcompany.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.phone}</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.website}</FormLabel>
                          <FormControl>
                            <Input placeholder="https://yourcompany.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nextInvoiceNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.nextInvoiceNumber}</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormDescription>{t.invoiceNumberDescription}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.address}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={currentLanguage === "ar" ? "عنوان الشركة" : "Company address"}
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="termsAndConditions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.termsAndConditions}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={
                              currentLanguage === "ar"
                                ? "سيتم تضمين هذه الشروط في فواتيرك"
                                : "These terms will appear on your invoices"
                            }
                            className="min-h-32 resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>{t.termsDescription}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </TabsContent>

              <TabsContent value="appearance">
                <CardContent className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.currency}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t.currencySymbol} />
                              </SelectTrigger>
                            </FormControl>
                              <SelectContent>
                               <SelectItem value="USD">USD ($)</SelectItem>
                              <SelectItem value="SAR" style={{ fontFamily: 'SaudiRiyalSymbol', fontSize: '20px' }}>
                                ﷼
                              </SelectItem>
                               <SelectItem value="EUR">EUR (€)</SelectItem>
                              <SelectItem value="GBP">GBP (£)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>{t.currencyDescription}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t.language}</FormLabel>
                          <Select onValueChange={(value) => handleLanguageChange(value)} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t.languagePreference} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">{t.english}</SelectItem>
                              <SelectItem value="ar">{t.arabic}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>{t.languageDescription}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
            <CardFooter>
              <Button type="submit" disabled={uploading}>
                {uploading ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t.saveSettings}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}

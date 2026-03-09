import type { Metadata } from "next"
import { ThemeProvider } from "next-themes"

import "../styles/globals.css"
import "../styles/elderly.css"
import { Toaster } from "@/components/ui/sonner"
import { SessionProvider } from "@/components/providers/session-provider"

export const metadata: Metadata = {
  title: {
    template: "%s | nAIber",
    default: "nAIber",
  },
  description:
    "Regular, caring check-in calls for your loved ones — tracking wellness without surveillance.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange
          >
            {children}
            <Toaster position="bottom-right" />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}

"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: "" }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-destructive" strokeWidth={1.5} />
          </div>
          <p className="font-medium text-warm-900 mb-1">Something went wrong</p>
          <p className="text-sm text-warm-500 max-w-xs mb-5">{this.state.message || "An unexpected error occurred."}</p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

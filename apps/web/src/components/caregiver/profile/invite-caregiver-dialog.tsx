"use client"

import { useState } from "react"
import { UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const RELATIONSHIPS = [
  "Spouse / Partner", "Son", "Daughter", "Sibling",
  "Friend", "Neighbour", "Other family member", "Professional carer",
]

interface InviteCaregiverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteCaregiverDialog({ open, onOpenChange }: InviteCaregiverDialogProps) {
  const [relationship, setRelationship] = useState("")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-medium text-warm-900">
            Invite a caregiver
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm text-warm-500">
            They'll receive an email invitation. If they don't have an account,
            they'll be prompted to create one first.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="caregiver@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Their relationship to your loved one</Label>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger>
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="invite-message">Message</Label>
              <span className="text-xs text-warm-500">optional</span>
            </div>
            <Textarea
              id="invite-message"
              placeholder="Add a personal note to the invite…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-teal text-ivory hover:bg-teal-light">
            <UserPlus size={14} className="mr-1.5" />
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { redirect } from 'next/navigation'

// Emails sent before 2026-10-02 link their footer here, and they stay in inboxes.
export default function SettingsPage() {
    redirect('/')
}

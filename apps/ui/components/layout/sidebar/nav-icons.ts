import { ActivityIcon, Building2, CircleUserIcon, HashIcon, KanbanIcon, LayoutDashboardIcon, ListChecksIcon, MessageSquareIcon, TargetIcon, UsersRound, type LucideIcon } from '@/lib/icons'
import type { NavItemId } from '@/lib/shell/nav'

// One glyph per area, shared by the sidebar, the drawer and the palette's "Go to" commands.
export const NAV_ICONS: Record<NavItemId, LucideIcon> = {
    overview: LayoutDashboardIcon,
    office: Building2,
    chat: MessageSquareIcon,
    work: CircleUserIcon,
    projects: KanbanIcon,
    goals: TargetIcon,
    review: ListChecksIcon,
    channels: HashIcon,
    teams: UsersRound,
    activity: ActivityIcon,
}

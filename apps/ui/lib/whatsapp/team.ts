import { boardImageUrl } from '@/lib/og/board-image'
import { teamBoardScene, type TeamMember, type TeamStatus } from '@/lib/og/team-board'

// The picture every message opens on: the workspace's own board, in the state the message is about.
export function teamBoardUrl(team: TeamMember[], status: TeamStatus): string {
    return boardImageUrl(teamBoardScene(team, status))
}

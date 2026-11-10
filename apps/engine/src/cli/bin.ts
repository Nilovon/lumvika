#!/usr/bin/env node
import '../lib/process-report.js'
import { runCommand } from './commands/run.js'
import { migrateCommand } from './commands/migrate.js'
import { agentCommand } from './commands/agent.js'
import { skillCommand } from './commands/skill.js'
import { scheduleCommand } from './commands/schedule.js'
import { mcpCommand } from './commands/mcp.js'
import { doctorCommand } from './commands/doctor.js'
import { installBrowserCommand, installDesktop, installLayoutCommand, rollbackCommand, updateCliTools, updateCommand } from './commands/update.js'
import { serviceCommand } from './commands/service.js'
import { restoreFinalizeCommand } from './commands/restore-finalize.js'

const HELP = `lumvika-engine

Usage:
  lumvika run                       Start the API server
  lumvika migrate                   Create or update the database
  lumvika restore-finalize          Migrate a restored data-dir, skip the runs it slept through
  lumvika agent create --name <n>   Create an agent
  lumvika agent list                List agents
  lumvika agent delete <id>         Delete an agent
  lumvika skill list <agentId>      List an agent's skills
  lumvika schedule list <agentId>   List an agent's scheduled tasks
  lumvika mcp login <id> <server>   Sign in to an OAuth MCP server
  lumvika mcp status <agentId>      Check MCP server connections
  lumvika mcp logout <id> <server>  Clear a stored MCP token
  lumvika doctor                    Check the environment
  lumvika update                    Pull, rebuild, migrate and restart the service (git checkout)
  lumvika update --artifact <url> --sha256 <hex> --commit <sha>
                                  Install a prebuilt release, migrate and restart the service
  lumvika rollback                  Go back to the previous release and restart the service
  lumvika install-layout            Write the launcher and the systemd units for the release layout
  lumvika install-browser           Install Chromium for the browser tool
  lumvika install-desktop           Install the window manager and VNC server behind the Computer
  lumvika update-cli-tools          Install the Codex CLI this release pins
  lumvika start | stop | restart    Control the systemd service
  lumvika status                    Show the service status
  lumvika logs [--no-follow]        Tail the service logs
`

async function main() {
    const [command, ...rest] = process.argv.slice(2)
    switch (command) {
        case 'run':
            return runCommand()
        case 'migrate':
            return migrateCommand()
        case 'restore-finalize':
            return restoreFinalizeCommand()
        case 'agent':
            return agentCommand(rest)
        case 'skill':
            return skillCommand(rest)
        case 'schedule':
            return scheduleCommand(rest)
        case 'mcp':
            return mcpCommand(rest)
        case 'doctor':
            return doctorCommand()
        case 'update':
            return updateCommand(rest)
        case 'rollback':
            return rollbackCommand()
        case 'install-layout':
            return installLayoutCommand()
        case 'install-browser':
            return installBrowserCommand()
        case 'install-desktop':
            return installDesktop()
        case 'update-cli-tools':
            return updateCliTools()
        case 'start':
        case 'stop':
        case 'restart':
        case 'status':
        case 'logs':
            return serviceCommand(command, rest)
        case undefined:
        case 'help':
        case '--help':
        case '-h':
            process.stdout.write(HELP)
            return
        default:
            process.stderr.write(`Unknown command: ${command}\n\n${HELP}`)
            process.exitCode = 1
    }
}

main().catch(err => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
})

# Caddy Server Manager for Raycast

A comprehensive Raycast extension for managing the Caddy web server on macOS.

## Features

### 🟢 Menu Bar Status

- Real-time status indicator showing if Caddy is running or stopped
- Quick access to all configured domains
- View process ID and uptime
- Quick actions: Start, Stop, Restart
- Refresh status with ⌘R

### 🚀 Commands

#### Start Caddy

Start the Caddy server using Homebrew services or direct caddy command.

#### Stop Caddy

Stop the running Caddy server gracefully.

#### Restart Caddy

Restart Caddy server to apply configuration changes.

#### View Caddy Config

Browse all configured domains and URLs from your Caddyfile:

- View all configured domains
- Open domains in browser
- Copy URLs and domain names
- View raw Caddyfile
- Quick access to Caddyfile location

## Requirements

- macOS
- Caddy installed (preferably via Homebrew: `brew install caddy`)
- Caddyfile in one of the following locations:
  - `/opt/homebrew/etc/Caddyfile` (Apple Silicon)
  - `/usr/local/etc/Caddyfile` (Intel)
  - `~/Caddyfile`
  - `/etc/caddy/Caddyfile`

## Installation

1. Clone or download this extension
2. Open Raycast
3. Navigate to Extensions > Add Extension
4. Select this extension directory

## Usage

### Menu Bar

The menu bar icon shows the current status of Caddy:

- 🟢 Green checkmark = Running
- 🔴 Red X = Stopped

Click the menu bar icon to:

- View status details (PID, uptime)
- See all configured domains
- Click on any domain to open it in your browser
- Start, stop, or restart Caddy

### Commands

Use Raycast's command palette to:

- `Start Caddy` - Start the server
- `Stop Caddy` - Stop the server
- `Restart Caddy` - Restart the server
- `View Caddy Config` - Browse domains and configuration

## How It Works

The extension:

1. Uses `pgrep` to detect if Caddy is running
2. Reads your Caddyfile from common installation locations
3. Parses domains and ports from the Caddyfile
4. Provides quick actions via Homebrew services or direct caddy commands

## Tips

- The menu bar updates automatically when you interact with it
- Use ⌘R to manually refresh the status
- Domain URLs are automatically detected with proper protocol (http/https) based on port
- All actions show toast notifications with success/failure status

## Development

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build
```

## License

MIT

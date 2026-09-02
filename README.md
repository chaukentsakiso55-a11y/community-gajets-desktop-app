# Community Gadgets Desktop

A Windows/desktop companion for the Cyber Pulse Community Gadget safety network.

This build turns a laptop or fixed community computer into an emergency terminal with three large signals:

- **SECURE** — area is safe; no location is collected or shared.
- **MONITOR** — suspicious activity; no location is collected or shared.
- **EMERGENCY** — urgent help needed; the desktop requests its current location only at that moment and includes it only if Windows can provide it.

## Current features

- Electron desktop interface with Cyber Pulse dark neon/glass styling
- Secure / Monitor / Emergency one-tap controls
- Repeating desktop alarm for received emergency alerts
- Windows notifications
- Active incident panel with sender, time, coordinates and accuracy
- Open received coordinates in OpenStreetMap
- Acknowledge an alert
- Mark yourself as responding
- Originating terminal can end its own alert
- Community activity feed
- Same Community Gadget v2 message fields and HMAC signing model used by the Android project
- PBKDF2-HMAC-SHA256 community-key derivation (120,000 iterations)
- Location privacy validation: non-emergency Secure/Monitor alerts are rejected if they contain coordinates
- LAN desktop-to-desktop transport using UDP broadcast
- Optional internet relay using WebSockets
- AES-256-GCM encryption around relay payloads so the relay does not receive readable alert/location content
- Automatic relay reconnect
- GitHub Actions Windows build that produces a portable EXE and installer

## Important Android interoperability note

The existing Android Community Gadget prototype transports its signed messages with **Android Nearby Connections**. Desktop Electron cannot directly join that Android-only Nearby Connections transport.

This desktop project deliberately matches the Android message/signature format, but direct phone ↔ desktop communication still requires a transport bridge. The recommended next step is to add the same encrypted WebSocket relay transport to the Android app while keeping Nearby Connections as its offline fallback. Once that is added, Android phones and desktop terminals can exchange the same signed Community Gadget messages over the relay.

## Run the desktop app

Requirements:

- Node.js 22 or newer
- Windows 10/11 recommended

```bash
npm install
npm start
```

On first launch:

1. Set a terminal name.
2. Enter the same private Community Gadget community code used by trusted devices.
3. Keep the default UDP port unless your community has chosen another one.
4. Optionally enter a WebSocket relay address such as a hosted `wss://` endpoint.
5. Save and reconnect.

Use a strong private community code. Eight characters is the technical minimum, but a longer randomly generated code is strongly recommended.

## Build Windows EXE files

```bash
npm install
npm run check
npm run pack:win
```

Build output is written to `dist/`.

The repository also contains `.github/workflows/windows-build.yml`. Every push to `main`, or a manual workflow run, builds the Windows artifacts and uploads them to the GitHub Actions run.

## LAN mode

Desktop terminals using the same community code and UDP port can exchange signed messages over the local network.

Windows Firewall may ask for permission the first time the app listens on the LAN. Allow access only on networks you trust.

LAN transport does not make the computer a multi-kilometre radio. Its range is limited by the local network infrastructure.

## Long-range relay mode

A minimal relay server is included in `relay-server/server.js`.

Start it with:

```bash
npm install
npm run relay
```

The server listens on port `8787` by default. Hosting platforms can override this with the `PORT` environment variable.

The relay routes clients by a one-way channel identifier derived from the community code. Alert payloads are encrypted on the desktop with AES-256-GCM before they are sent to the relay. The relay forwards the encrypted `sealed` field and never needs the private community code.

For internet deployment, place the relay behind TLS and use a `wss://` address.

## Privacy and safety rules

- Location is requested only when creating a red Emergency alert.
- Secure and Monitor messages must not contain location.
- The desktop does not continuously track location.
- If Windows cannot provide a location during an emergency, the emergency alert still sends without coordinates.
- Every message is authenticated with the private community key.
- Long-range relay traffic is encrypted in addition to the signed inner message.
- This is a prototype community-warning system, not a certified emergency-service replacement.
- Keep ordinary emergency-service, trusted-adult and community safety procedures available as backup paths.

## Project structure

```text
community-gadgets-desktop-app/
├── .github/workflows/windows-build.yml
├── main.js                 Electron runtime, alarms, UDP, encrypted relay
├── preload.js              context-isolated IPC bridge
├── package.json
├── relay-server/
│   └── server.js           WebSocket relay that only forwards sealed payloads
└── src/
    ├── index.html          desktop terminal interface
    ├── protocol.js         signing, verification and privacy rules
    ├── renderer.js         emergency workflow and incident state
    └── styles.css          Cyber Pulse visual design
```

## Ownership

Community Gadget is a Cyber Pulse project based on the community-safety concept led by Mawela Nkoriso, with software development led by Ntsakiso Chauke (Darthwolf).

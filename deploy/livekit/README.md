# Self-hosted LiveKit SFU for the video room

This replaces the built-in peer-to-peer **mesh** (which fails across firewalls and
struggles past ~6 people) with a **selective forwarding unit (SFU)**: each
participant sends their audio/video **once** to your LiveKit server, which forwards
it to everyone. Because everyone connects only to that one server — which everyone
can reach — the "only the admin sees everyone" problem disappears. LiveKit also has
a built-in TURN relay, so no separate coturn is needed.

## The work has two parts

### Part 1 — Run the LiveKit server (infrastructure) ✅ files provided here
1. Edit **`livekit.yaml`**:
   - `keys:` → set `<API_KEY>: <API_SECRET>` (any key name + a long random secret).
   - Set `node_ip` / external IP if the host is behind NAT.
2. Open firewall ports: `7880/tcp`, `7881/tcp`, `3478/udp`, `50000-50200/udp`.
3. Start it:
   ```
   docker compose up -d
   ```
4. Put the connection details in the app's `.env`:
   ```
   LIVEKIT_URL=ws://<PUBLIC_OR_LAN_IP>:7880
   LIVEKIT_API_KEY=<API_KEY>
   LIVEKIT_API_SECRET=<API_SECRET>
   ```

### Part 2 — Switch the app's video room to LiveKit (application code) — TODO
This is the larger phase, done in the app codebase:

1. **Dependencies:** add `livekit-server-sdk` (server, mints access tokens) and
   `livekit-client` + `@livekit/components-react` (client, joins the room).
2. **Token endpoint:** a server route that authenticates the user (reusing the
   existing `getCurrentUser` + room access check) and returns a LiveKit JWT scoped
   to that meeting's room, with the user's name/identity.
3. **Room client:** the room joins the LiveKit room with that token and renders the
   participant video grid from LiveKit tracks — replacing the custom mesh/SSE
   signalling for audio & video, camera/mic/screen-share toggles.
4. **Keep app-specific features** (in-call chat, raise-hand, shared-document
   presentation, resolution voting) — these can stay on the existing SSE hub, or be
   moved onto LiveKit data messages. Keeping them on the SSE hub is the smaller change.

Part 2 must be validated against a **running** LiveKit server (Part 1), so it's
best done once the server above is up.

# TURN relay for the video room

The built-in video meeting is peer-to-peer. When two participants can't open a
direct connection (corporate firewall, NAT, Wi‑Fi client isolation), their video
must be relayed through a **TURN server**. Without one, you get the classic
symptom: one person (usually on the server's network) sees everyone, everyone
else sees blank tiles.

You have two ways to get a TURN server.

## Option A — Managed TURN (no server to run, fastest)

Sign up with a TURN provider and paste the credentials they give you into the
app's `.env`:

```
TURN_URL=turn:<their-host>:3478
TURN_USERNAME=<from provider>
TURN_CREDENTIAL=<from provider>
```

Providers: **Cloudflare Calls TURN**, **Metered**, **Twilio Network Traversal**,
**Xirsys**. Most have a free/low tier fine for a board's usage. Restart the app
after setting the values.

## Option B — Self-host coturn (this folder)

Run on a Linux host every participant can reach (a small VPS with a public IP for
internet users, or a LAN server if everyone is on the company network/VPN).

1. Edit **`turnserver.conf`**:
   - `user=boardmeet:<STRONG_SHARED_SECRET>` — pick a long random secret.
   - `external-ip=<PUBLIC_OR_LAN_IP>` — the address clients use to reach this host.
2. Open firewall ports: **3478/tcp**, **3478/udp**, and **49160-49200/udp**
   (the relay range). For internet use also forward these from your router/NAT.
3. Start it:
   ```
   docker compose up -d
   ```
4. Point the app at it — in the app's `.env`:
   ```
   TURN_URL=turn:<PUBLIC_OR_LAN_IP>:3478
   TURN_USERNAME=boardmeet
   TURN_CREDENTIAL=<STRONG_SHARED_SECRET>
   ```
   Then restart the app and rejoin the meeting.

## Verify it works

Paste your `TURN_URL` / username / credential into the WebRTC Trickle ICE tester
(`webrtc.github.io/samples/src/content/peerconnection/trickle-ice/`). If you see a
candidate of type **`relay`**, the TURN server is reachable and working — video
will now connect for everyone.

## Notes
- With a valid `TURN_URL` set, the app uses **your** relay and ignores the public
  fallback. Prefer this for confidential board video (media stays on your server).
- For internet use, add TLS (`turns:` on 5349) so the relay works even on networks
  that only allow HTTPS — uncomment the TLS lines in `turnserver.conf`.

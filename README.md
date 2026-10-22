# CodeAlpha Task 4 — ConnectNow

A starter real-time collaboration app with room chat, WebRTC video calling, screen sharing, shared whiteboard, file uploads, and account registration/login.

## Run in VS Code (Windows)

1. Extract `Task4_RealTimeCommunication.zip`.
2. In VS Code choose **File → Open Folder** and select `Task4_RealTimeCommunication`.
3. Open **Terminal → New Terminal**. Confirm the path ends in `Task4_RealTimeCommunication`.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Open **http://localhost:3002**.

## Test with two participants
1. Open the site in Chrome/Edge and join room `lobby` with a display name.
2. Open a second browser window (or another device on the same network) and join the exact same room name.
3. Send chat messages and draw on the whiteboard; both participants should see updates.
4. Click **Enable camera** on both sides to try WebRTC video. Allow browser camera/microphone permission.
5. Click **Share screen** to share a screen.
6. Register/log in to upload a file (maximum 1 MB for this demo).

## Important limitations
- WebRTC media uses DTLS-SRTP encryption in transit. This demo does not implement end-to-end encryption for chat messages/files.
- A public STUN server is configured for development. Real deployments usually need a TURN server for connections across restrictive networks.
- File uploads are intentionally limited to 1 MB and are served from a local `uploads` folder. Add stronger file validation, authentication/authorization, storage controls, malware scanning, and cleanup before deployment.
- The included Express in-memory session store is for local demos only. Use a persistent session store and a strong `SESSION_SECRET` in production.
- The video feature is a learning starter; test with two separate browser contexts. A production multi-user conferencing app needs robust signaling, TURN configuration, and careful peer lifecycle handling.

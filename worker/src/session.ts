// WhatsApp session lifecycle.
//
// This module owns the ONLY WhatsApp socket in the system. It translates real
// Baileys events into the connection_status values the admin UI understands.
// Nothing here ever writes an optimistic "connected" - status only advances on
// a genuine connection.update payload (section 57).

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type ConnectionState,
  type WAConnectionState,
} from "@whiskeysockets/baileys";
import { rm } from "node:fs/promises";
import path from "node:path";
import { db, patchSettings, writeAudit } from "./db";

export type Handler = {
  onConnected: () => void;
  onDisconnected: (reason: string) => void;
  onQr: (qr: string, expiresAt: Date) => void;
  onStatusUpdate: (status: WAConnectionState) => void;
};

export class WhatsappSession {
  private sock: WASocket | null = null;
  private handlers: Handler;
  private sessionDir: string;
  private starting = false;
  private closing = false;
  private lastStatus: WAConnectionState | null = null;

  constructor(handlers: Handler) {
    this.handlers = handlers;
    this.sessionDir =
      process.env.WA_SESSION_DIR || path.join(process.cwd(), ".wa-session");
  }

  isOpen(): boolean {
    return !!this.sock && this.lastStatus === "open";
  }

  getSock(): WASocket | null {
    return this.sock;
  }

  /**
   * Start (or restart) the socket.
   *
   * Guards:
   *  - `starting` prevents two concurrent boots in one process.
   *  - `closing` stops a reconnect racing an explicit Disconnect command.
   *  - an already-open socket is reused rather than duplicated, which is what
   *    keeps this to exactly one WhatsApp process (section 10).
   */
  async start(options: { fresh?: boolean } = {}): Promise<void> {
    if (this.starting) return;
    if (this.sock && !options.fresh) return;
    this.starting = true;

    try {
      // Always tear down any existing socket BEFORE creating a new one.
      // Leaving a previous socket alive while opening a second one on the same
      // credential directory makes WhatsApp see two live devices under one
      // identity, so the freshly scanned QR completes pairing and then hangs:
      // the QR appears and scans, but the session never reaches 'open'.
      if (this.sock) {
        await this.disposeSocket();
      }

      if (options.fresh) {
        await this.destroySessionFiles();
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      await patchSettings({
        connection_status: "CONNECTING",
        current_qr: null,
        qr_expires_at: null,
        last_error: null,
      });

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Corhaus", "Chrome", "120.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        // A WhatsApp Web session that has been unlinked server-side must come
        // back as LOGGED_OUT, not a silent reconnect.
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        retryRequestDelayMs: 500,
      });
      this.sock = sock;

      // Persist credentials to disk on every rotation. Without this the pairing
      // is lost on restart and the session can never survive a redeploy.
      sock.ev.on("creds.update", saveCreds);

      // Baileys surfaces protocol failures as stream errors and an
      // unhandled 'error' event, both of which are otherwise silent. Without
      // these, a pairing failure looks identical to "still waiting".
      (sock.ev as unknown as { on: (e: string, h: (err: unknown) => void) => void }).on(
        "error",
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[worker] Baileys stream error:", message);
          void patchSettings({
            connection_status: "ERROR",
            last_error: message.slice(0, 500),
            last_error_at: new Date().toISOString(),
          }).catch(() => {});
        }
      );

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update as Partial<ConnectionState>;

        if (qr) {
          // Baileys rotates the QR roughly every 20s. Publish it with a TTL so
          // the UI never renders an expired code as if it were valid.
          const expiresAt = new Date(Date.now() + 25_000);
          await patchSettings({
            connection_status: "QR_READY",
            current_qr: qr,
            qr_expires_at: expiresAt.toISOString(),
            last_error: null,
          });
          this.handlers.onQr(qr, expiresAt);
          return;
        }

        if (connection) {
          this.lastStatus = connection;
          this.handlers.onStatusUpdate(connection);

          if (connection === "open") {
            const jid = sock.user?.id ?? null;
            const phone = jid ? jid.split("@")[0]?.split(":")[0] ?? null : null;
            const now = new Date().toISOString();
            await patchSettings({
              connection_status: "CONNECTED",
              // The pairing QR is dead the moment we are authenticated.
              current_qr: null,
              qr_expires_at: null,
              connected_phone: phone,
              connected_at: now,
              last_connected_at: now,
              last_error: null,
            });
            await writeAudit("whatsapp.connected", { phone });
            this.handlers.onConnected();
            return;
          }

          if (connection === "close") {
            const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })
              ?.output?.statusCode;
            const reason =
              statusCode === DisconnectReason.loggedOut
                ? "LOGGED_OUT"
                : statusCode === DisconnectReason.badSession
                  ? "LOGGED_OUT"
                  : "DISCONNECTED";
            const human =
              statusCode === DisconnectReason.loggedOut
                ? "WhatsApp unlinked this device. Scan a new QR code to reconnect."
                : statusCode === DisconnectReason.connectionClosed
                  ? "WhatsApp closed the connection."
                  : statusCode === DisconnectReason.connectionLost
                    ? "Lost connection to WhatsApp."
                    : statusCode === DisconnectReason.restartRequired
                      ? "WhatsApp requires a reconnect."
                      : `Connection closed (code ${statusCode ?? "unknown"}).`;

            await patchSettings({
              connection_status: reason,
              current_qr: null,
              qr_expires_at: null,
              connected_phone: null,
              last_disconnected_at: new Date().toISOString(),
              last_error: human,
              last_error_at: new Date().toISOString(),
            });
            await writeAudit("whatsapp.disconnected", { status_code: statusCode ?? null, reason: human });
            this.handlers.onDisconnected(human);

            // A logged-out session cannot be revived; the admin must rescan.
            if (statusCode !== DisconnectReason.loggedOut) {
              this.scheduleReconnect();
            } else {
              this.lastStatus = null;
              this.sock = null;
            }
          }
        }
      });

      this.starting = false;
    } catch (err) {
      this.starting = false;
      const message = err instanceof Error ? err.message : String(err);
      await patchSettings({
        connection_status: "ERROR",
        last_error: message,
        last_error_at: new Date().toISOString(),
      });
      await writeAudit("whatsapp.connection_error", { error: message });
      throw err;
    }
  }

  private reconnectTimer: NodeJS.Timeout | null = null;

  private scheduleReconnect(): void {
    if (this.closing) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closing) return;
      this.start()
        .then(() => this.handlers.onStatusUpdate("connecting"))
        .catch((err) => console.error("[worker] reconnect failed:", err));
    }, 5_000);
  }

  /** Close and forget the current socket without touching credentials. */
  private async disposeSocket(): Promise<void> {
    const old = this.sock;
    this.sock = null;
    this.lastStatus = null;
    if (!old) return;
    try {
      old.ev.removeAllListeners("connection.update");
    } catch {
      /* listener removal is best-effort */
    }
    try {
      old.ws?.close();
    } catch {
      /* socket may already be closed */
    }
    try {
      old.end(undefined);
    } catch (err) {
      console.error("[worker] socket end error:", err);
    }
  }

  /** Explicit logout: clears the credential files so a fresh QR is required. */
  async logoutAndClear(): Promise<void> {
    this.closing = true;
    try {
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch (err) {
          console.error("[worker] logout error (clearing files anyway):", err);
        }
      }
    } finally {
      await this.destroySessionFiles();
      this.sock = null;
      this.lastStatus = null;
      this.closing = false;
      await patchSettings({
        connection_status: "DISCONNECTED",
        enabled: false,
        connected_phone: null,
        current_qr: null,
        qr_expires_at: null,
        last_disconnected_at: new Date().toISOString(),
      });
    }
  }

  /** Stop the socket but keep credentials, so the next start reconnects silently. */
  async softStop(): Promise<void> {
    this.closing = true;
    try {
      await this.disposeSocket();
    } finally {
      this.closing = false;
    }
  }

  private async destroySessionFiles(): Promise<void> {
    try {
      await rm(this.sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.error("[worker] could not clear session files:", err);
    }
  }

  /** Release stale PROCESSING rows after an unclean shutdown (section 48). */
  async recoverStuckJobs(): Promise<void> {
    const { error } = await db()
      .from("whatsapp_message_jobs")
      .update({
        status: "PENDING",
        claimed_at: null,
        claimed_by: null,
      })
      .eq("status", "PROCESSING");
    if (error) {
      console.error("[worker] stuck-job recovery failed:", error.message);
      return;
    }
    console.log("[worker] recovered any stale PROCESSING jobs to PENDING");
  }
}
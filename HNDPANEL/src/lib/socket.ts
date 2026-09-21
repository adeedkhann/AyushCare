import { io, Socket } from 'socket.io-client';

const rawSocketUrl =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') ||
  process.env.VITE_SOCKET_URL ||
  'http://localhost:8000';

const SOCKET_URL = rawSocketUrl.replace(/\/+$/, '');

let socket: Socket | null = null;
let hasLoggedConnectWarning = false;

export const getSocket = (): Socket => {
  if (typeof window === 'undefined') {
    return {} as Socket;
  }

  if (!socket) {
    try {
      socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        autoConnect: true,
      });

      socket.on('connect', () => {
        hasLoggedConnectWarning = false;
      });

      socket.on('connect_error', (err) => {
        if (!hasLoggedConnectWarning) {
          console.warn(
            `[Socket.io] Backend socket connection notice (${SOCKET_URL}): ${err.message}. Retrying via polling/websocket.`
          );
          hasLoggedConnectWarning = true;
        }
      });

      socket.on('reconnect_failed', () => {
        if (!hasLoggedConnectWarning) {
          console.warn(
            `[Socket.io] Reconnection attempts exhausted (${SOCKET_URL}). Backend socket service may be offline.`
          );
          hasLoggedConnectWarning = true;
        }
      });

      socket.on('error', (err) => {
        console.warn('[Socket.io] Error event:', err);
      });
    } catch (err) {
      console.warn('[Socket.io] Initialization exception:', err);
    }
  }

  return socket!;
};

export const subscribeToQueueEvents = (
  onQueueUpdated?: (data?: any) => void,
  onTokenCalled?: (data?: any) => void,
  onPatientReady?: (data?: any) => void,
  onRedFlag?: (data?: any) => void
) => {
  const s = getSocket();
  if (!s || typeof s.on !== 'function') return () => { };

  if (onQueueUpdated) s.on('queue:updated', onQueueUpdated);
  if (onTokenCalled) s.on('token:called', onTokenCalled);
  if (onPatientReady) s.on('patient:ready', onPatientReady);
  if (onRedFlag) s.on('triage:red-flag', onRedFlag);

  return () => {
    if (onQueueUpdated) s.off('queue:updated', onQueueUpdated);
    if (onTokenCalled) s.off('token:called', onTokenCalled);
    if (onPatientReady) s.off('patient:ready', onPatientReady);
    if (onRedFlag) s.off('triage:red-flag', onRedFlag);
  };
};

export const subscribeToSosAlerts = (onSosAlert: (data: any) => void) => {
  const s = getSocket();
  if (!s || typeof s.on !== 'function') return () => {};

  s.on('sos:alert', onSosAlert);
  return () => s.off('sos:alert', onSosAlert);
};

export const disconnectSocket = () => {
  if (socket && typeof socket.disconnect === 'function') {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    hasLoggedConnectWarning = false;
  }
};

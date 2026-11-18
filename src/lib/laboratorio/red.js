// Inside the workers of the lab, once the engine is loaded: the code the student runs has no way out of the browser.
// The worker starts from a blob, so it already carries the page's CSP (connect-src, script-src without eval): this is a
// second lock, and the one that also covers what the CSP lets through (this site, the campus, Google). Everything that
// asks for something over the network, that opens another worker or reaches the site's storage (the student's files in
// IndexedDB) goes away from the global object and from every prototype above it, so it can't be fetched back.
export const SIN_RED = [
  'fetch', 'fetchLater', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'importScripts',
  'Worker', 'SharedWorker', 'caches', 'indexedDB', 'BroadcastChannel', 'CookieStore', 'cookieStore', 'RTCPeerConnection',
  'webkitRTCPeerConnection', 'RTCDataChannel', 'WebSocketError', 'postMessage',
];

/** Takes away what reaches the network from `global` (the worker's `self`). Returns the names that were there. */
export function cerrarRed(global, nombres = SIN_RED) {
  const habia = [];
  for (const nombre of nombres) {
    let alguno = false;
    for (let o = global; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      if (!Object.prototype.hasOwnProperty.call(o, nombre)) continue;
      alguno = true;
      try {
        delete o[nombre];
      } catch {
        // Not configurable: shadowed below.
      }
    }
    if (alguno) habia.push(nombre);
    try {
      Object.defineProperty(global, nombre, { value: undefined, writable: false, configurable: false, enumerable: false });
    } catch {
      // Already fixed as it is: nothing else to do.
    }
  }
  return habia;
}

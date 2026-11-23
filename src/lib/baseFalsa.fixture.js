// A database of the browser, enough for sinInternetDisco.js and descargasFondo.js: transactions over several stores,
// get, put, delete, clear and a cursor. Each request answers in a microtask; the transaction completes when none is left.
export function baseFalsa() {
  const bases = new Map();
  const falsa = {
    open: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        let datos = bases.get(nombre);
        const nueva = !datos;
        if (nueva) bases.set(nombre, (datos = new Map()));
        pedido.result = {
          objectStoreNames: { contains: (n) => datos.has(n) },
          createObjectStore: (n) => datos.set(n, new Map()),
          close: () => {},
          transaction: () => transaccion(datos),
        };
        if (nueva) pedido.onupgradeneeded?.();
        pedido.onsuccess?.();
      });
      return pedido;
    },
    deleteDatabase: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        bases.delete(nombre);
        pedido.onsuccess?.();
      });
      return pedido;
    },
  };
  function transaccion(datos) {
    const tx = {};
    let pendientes = 0;
    let terminada = false;
    const revisar = () => {
      if (pendientes || terminada) return;
      terminada = true;
      queueMicrotask(() => tx.oncomplete?.());
    };
    const hacer = (f, pedido = {}) => {
      pendientes += 1;
      queueMicrotask(() => {
        pedido.result = f();
        pendientes -= 1;
        pedido.onsuccess?.();
        revisar();
      });
      return pedido;
    };
    tx.objectStore = (nombre) => {
      const m = datos.get(nombre);
      return {
        get: (k) => hacer(() => structuredClone(m.get(k))),
        put: (v, k) => hacer(() => m.set(k, structuredClone(v)) && k),
        delete: (k) => hacer(() => void m.delete(k)),
        clear: () => hacer(() => void m.clear()),
        openCursor: () => {
          const claves = [...m.keys()];
          let i = 0;
          const pedido = {};
          const paso = () => (i < claves.length ? { key: claves[i], value: structuredClone(m.get(claves[i])), continue: () => { i += 1; hacer(paso, pedido); } } : null);
          return hacer(paso, pedido);
        },
      };
    };
    queueMicrotask(revisar);
    return tx;
  }
  return falsa;
}

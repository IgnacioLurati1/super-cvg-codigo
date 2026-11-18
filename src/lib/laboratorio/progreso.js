// Inside a worker, while its engine downloads: `fetch` counts what arrives of each file, so the screen can show how much
// is left. The answer is the same one, with its body read through a counter: WebAssembly still compiles it as it comes.
export function contarBajadas(global, alAvanzar) {
  const original = global.fetch.bind(global);
  let bajado = 0;
  global.fetch = async (...args) => {
    const respuesta = await original(...args);
    if (!respuesta.ok || !respuesta.body) return respuesta;
    const lector = respuesta.body.getReader();
    const cuerpo = new ReadableStream({
      async pull(control) {
        const { done, value } = await lector.read();
        if (done) {
          control.close();
          return;
        }
        bajado += value.byteLength;
        alAvanzar(bajado);
        control.enqueue(value);
      },
      cancel: (motivo) => lector.cancel(motivo),
    });
    return new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
  };
  // Back to the browser's own, before it goes away for good (red.js).
  return () => {
    global.fetch = original;
  };
}

// The Python of «Paso a paso» and «Medir tiempos», run in the worker after the runner (corredor.js: it uses its
// `_preparar`, `_leer`, `_fallo`, `_del_proyecto` and `_cargados`). Same file name as the runner, so the traceback
// leaves these frames out too.
//
// Step by step: the program runs with sys.settrace, and each line, call, return and error of the student's files (every
// `.py` of the project) is a step, with its file (`a`, also in each frame). A step keeps which frames there are, with their variables, the objects they reach (lists, tuples, dicts, sets,
// objects of the student's classes) and how much it had printed. Frames and objects are kept once each, as JSON text,
// and the steps point to them: a list that doesn't change costs nothing more. At the limit of steps the program stops.
// What it gives back, by `_laboratorio.pasos(texto)`: { pasos, marcos, objetos, salida, tope } (pasos.js reads it).
//
// Measuring: the program runs once (its functions get defined), and then the chosen function with an input built for
// each n, several times, with what it prints set aside. Each n is told as it ends; a size that wouldn't fit in the
// budget isn't started.
export const RASTREO = `
import gc, io, json, math, random, re, time, types

class _Tope(BaseException):
    pass

class _PideEntrada(BaseException):
    pass

_LARGO = 60
_ELEMENTOS = 40
_OBJETOS = 60
_MARCOS = 25
_VARIABLES = 80
_TIPOS = {list: "lista", tuple: "tupla", dict: "diccionario", set: "conjunto", frozenset: "conjunto"}
_SIMPLES = (type(None), bool, int, float, complex, str, bytes)
_DIRECCION = re.compile(r" at 0x[0-9a-fA-F]+")

def _dunder(n):
    return isinstance(n, str) and n.startswith("__") and n.endswith("__")

def _ultima_linea(e):
    return "".join(traceback.format_exception_only(type(e), e)).strip().splitlines()[-1]

class _Copia(io.TextIOBase):
    def __init__(self, real, flujo, anotar):
        self._real = real
        self._flujo = flujo
        self._anotar = anotar
    def writable(self):
        return True
    def write(self, s):
        s = str(s)
        self._anotar(self._flujo, s)
        return self._real.write(s)
    def flush(self):
        self._real.flush()

class _Nada(io.TextIOBase):
    def writable(self):
        return True
    def write(self, s):
        return len(s)

class _Rastro:
    def __init__(self, tope):
        self.tope = tope
        self.pasos = []
        self.marcos = []
        self.objetos = []
        self._marcos = {}
        self._objetos = {}
        self.numeros = {}
        self.cuantos = {}
        self.vivos = []
        self.salida = []
        self.escrito = 0
        self.cortado = False
        self.mandado = False
        self.con_error = set()

    def anotar(self, flujo, texto):
        if not texto:
            return
        if self.salida and self.salida[-1][0] == flujo:
            self.salida[-1][1] += texto
        else:
            self.salida.append([flujo, texto])
        self.escrito += len(texto)

    def corto(self, v):
        if type(v) is int and v.bit_length() > 190:
            return ["e", len(str(abs(v))) if v.bit_length() < 13000 else 0]
        try:
            r = repr(v)
        except Exception:
            r = "?"
        r = _DIRECCION.sub("", r)
        return ["v", r if len(r) <= _LARGO else r[: _LARGO - 1] + "\\u2026"]

    def propio(self, t):
        modulo = getattr(t, "__module__", None)
        return (modulo == "__main__" or modulo in _cargados) and t not in (_Copia, _Nada, _Entrada, _Rastro)

    # A value: inline if it's simple, a reference (its number) if it's an object to draw apart.
    def valor(self, v, pendientes):
        t = type(v)
        if t in _SIMPLES:
            return self.corto(v)
        if t in _TIPOS or self.propio(t):
            clave = id(v)
            n = self.numeros.get(clave)
            if n is None:
                tipo = _TIPOS.get(t, "objeto")
                clase = None if tipo != "objeto" else t.__name__
                cuenta = clase or tipo
                self.cuantos[cuenta] = self.cuantos.get(cuenta, 0) + 1
                n = len(self.numeros) + 1
                self.numeros[clave] = n
                # Kept until the end: no other object takes its id (and its name) while the program runs.
                self.vivos.append((v, tipo, self.cuantos[cuenta], clase))
            pendientes.append(n)
            return ["r", n]
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return ["f", getattr(v, "__name__", "?")]
        if isinstance(v, type):
            return ["c", v.__name__]
        if isinstance(v, types.ModuleType):
            return ["m", v.__name__]
        return self.corto(v)

    def foto(self, n, pendientes):
        v, tipo, k, clase = self.vivos[n - 1]
        d = {"i": n, "t": tipo, "k": k}
        mas = 0
        if tipo == "diccionario":
            pares = list(v.items())
            d["p"] = [[self.valor(a, pendientes), self.valor(b, pendientes)] for a, b in pares[:_ELEMENTOS]]
            mas = len(pares) - _ELEMENTOS
        elif tipo in ("lista", "tupla", "conjunto"):
            elementos = list(v) if tipo == "conjunto" else v
            d["e"] = [self.valor(x, pendientes) for x in elementos[:_ELEMENTOS]]
            mas = len(elementos) - _ELEMENTOS
        else:
            d["c"] = clase
            campos = getattr(type(v), "_fields", None)
            if isinstance(v, tuple) and campos:
                pares = list(zip(campos, v))
            else:
                atributos = getattr(v, "__dict__", None)
                pares = [(a, b) for a, b in atributos.items() if not _dunder(a)] if isinstance(atributos, dict) else []
            d["a"] = [[str(a), self.valor(b, pendientes)] for a, b in pares[:_ELEMENTOS]]
            mas = len(pares) - _ELEMENTOS
        if mas > 0:
            d["m"] = mas
        return d

    def marco(self, f, linea, pendientes):
        co = f.f_code
        if co.co_name == "<module>":
            tipo = "g"
            pares = [(a, b) for a, b in f.f_globals.items() if not _dunder(a)]
        else:
            tipo = "f" if co.co_flags & 1 else "c"
            pares = list(f.f_locals.items())
            if tipo == "c":
                pares = [(a, b) for a, b in pares if not _dunder(a)]
        d = {"f": co.co_name, "a": co.co_filename, "t": tipo, "l": linea, "v": [[str(a), self.valor(b, pendientes)] for a, b in pares[:_VARIABLES]]}
        if len(pares) > _VARIABLES:
            d["m"] = len(pares) - _VARIABLES
        return d

    def guardar(self, tabla, indice, d):
        texto = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
        n = indice.get(texto)
        if n is None:
            n = len(tabla)
            indice[texto] = n
            tabla.append(texto)
        return n

    def paso(self, frame, evento, arg):
        pila = []
        f = frame
        while f is not None:
            if _del_proyecto(f.f_code.co_filename):
                pila.append(f)
            f = f.f_back
        pila.reverse()
        ocultos = 0
        if len(pila) > _MARCOS + 1:
            ocultos = len(pila) - _MARCOS - 1
            pila = pila[:1] + pila[-_MARCOS:]
        pendientes = []
        marcos = [self.guardar(self.marcos, self._marcos, self.marco(f, f.f_lineno, pendientes)) for f in pila]
        p = {"e": evento, "a": frame.f_code.co_filename, "l": frame.f_lineno, "s": self.escrito, "m": marcos}
        if ocultos:
            p["h"] = ocultos
        if evento == "return" and frame.f_code.co_name != "<module>" and id(frame) not in self.con_error:
            p["d"] = self.valor(arg, pendientes)
        if evento == "exception":
            p["x"] = _ultima_linea(arg[1]) if arg and arg[1] is not None else ""
        objetos = []
        hechos = set()
        i = 0
        while i < len(pendientes) and len(objetos) < _OBJETOS:
            n = pendientes[i]
            i += 1
            if n in hechos:
                continue
            hechos.add(n)
            objetos.append(self.guardar(self.objetos, self._objetos, self.foto(n, pendientes)))
        p["o"] = objetos
        if evento == "return" and frame.f_code.co_name == "<module>" and frame.f_globals.get("__name__") == "__main__":
            p["e"] = "fin"
        self.pasos.append(p)

    def texto(self):
        return '{"pasos":' + json.dumps(self.pasos, ensure_ascii=False, separators=(",", ":")) + ',"marcos":[' + ",".join(self.marcos) + '],"objetos":[' + ",".join(self.objetos) + '],"salida":' + json.dumps(self.salida, ensure_ascii=False) + ',"tope":' + ("true" if self.cortado else "false") + "}"

    def mandar(self):
        if not self.mandado:
            self.mandado = True
            _laboratorio.pasos(self.texto())

    def __call__(self, frame, evento, arg):
        if not _del_proyecto(frame.f_code.co_filename):
            return None
        if evento == "call" and frame.f_code.co_name == "<module>":
            return self
        if evento not in ("call", "line", "return", "exception"):
            return self
        if len(self.pasos) >= self.tope:
            # Enough: what was seen goes now, and the program stops here.
            self.cortado = True
            self.mandar()
            raise _Tope()
        if evento == "exception":
            self.con_error.add(id(frame))
        elif evento == "line":
            self.con_error.discard(id(frame))
        try:
            self.paso(frame, evento, arg)
        except Exception:
            pass
        if evento == "return":
            self.con_error.discard(id(frame))
        return self

def _paso_a_paso(codigo, nombre, lineas, tope):
    _preparar(codigo, nombre, lineas)
    try:
        programa = compile(codigo, nombre, "exec")
    except SyntaxError as e:
        return _sintaxis(e, nombre)
    rastro = _Rastro(int(tope))
    def _leer_y_anotar(prompt=""):
        if rastro.cortado:
            raise _Tope()
        linea = _leer(prompt)
        if can_run_sync():
            rastro.anotar("in", linea + "\\n")
        return linea
    builtins.input = _leer_y_anotar
    espacio = _espacio(nombre)
    afuera, errores = sys.stdout, sys.stderr
    sys.stdout = _Copia(afuera, "out", rastro.anotar)
    sys.stderr = _Copia(errores, "err", rastro.anotar)
    resultado = [None, 0, None]
    sys.settrace(rastro)
    try:
        exec(programa, espacio)
    except _Tope:
        pass
    except SystemExit as e:
        if e.code not in (None, 0):
            sys.stderr.write(str(e.code) + "\\n")
    except BaseException as e:
        resultado = _fallo(e)
    finally:
        sys.settrace(None)
        sys.stdout.flush()
        sys.stderr.flush()
        sys.stdout, sys.stderr = afuera, errores
    if resultado[0] and not rastro.cortado:
        rastro.anotar("err", resultado[0])
        if rastro.pasos and rastro.pasos[-1]["e"] == "fin":
            rastro.pasos[-1]["x"] = resultado[0].strip().splitlines()[-1]
            if resultado[1]:
                rastro.pasos[-1]["l"] = resultado[1]
                rastro.pasos[-1]["a"] = resultado[2]
    rastro.mandar()
    return resultado

def _una_vez(f, armar, n, veces):
    entradas = [armar(n) for _ in range(veces)]
    reloj = time.perf_counter
    # As timeit: the collector doesn't stop in the middle of a round.
    gc.disable()
    try:
        desde = reloj()
        for a, k in entradas:
            f(*a, **k)
        return reloj() - desde
    finally:
        gc.enable()

# How long a call takes with n: as many calls together as fill 20 ms (the browser's clock is coarse), the best of five
# rounds (of three, or less, if they're long). The inputs of a round are built before it: with a big n, fewer calls
# together, so they fit in memory.
def _tiempo(f, armar, n):
    tope = max(1, min(10000, 2000000 // max(n, 1)))
    veces = 1
    while True:
        t = _una_vez(f, armar, n, veces)
        if t >= 0.02 or veces >= tope:
            break
        veces = min(tope, veces * 10 if t < 0.002 else max(veces * 2, int(veces * 0.03 / t)))
    mejor = t / veces
    for _ in range(4 if t < 0.1 else 2 if t < 0.3 else 1 if t < 1 else 0):
        mejor = min(mejor, _una_vez(f, armar, n, veces) / veces)
    return mejor, veces

# Sizes by themselves: from 1 up while a call takes less than _AUTO_DESDE (the fixed cost of a call would weigh), or
# up to _AUTO_SONDEO for what takes nothing; from there _AUTO_PUNTOS sizes, each one up to four times the time of the
# one before and at most the double of n. 2ⁿ goes 16, 19, 21, 23; n, by doubles.
_AUTO_DESDE = 1e-4
_AUTO_SONDEO = 1000
_AUTO_PUNTOS = 6
_AUTO_MAX_N = 2000000

def _siguiente(medidos):
    if not medidos:
        return 1
    n1, t1 = medidos[-1]
    k = 1.0
    if len(medidos) >= 2:
        n0, t0 = medidos[-2]
        if t0 > 0 and t1 > 0:
            k = max(k, math.log(t1 / t0) / math.log(n1 / n0))
    if t1 < _AUTO_DESDE and n1 < _AUTO_SONDEO:
        factor = min(8.0, max(1.2, (_AUTO_DESDE / max(t1, 1e-9)) ** (1 / k)))
        return min(_AUTO_SONDEO, max(n1 + 1, round(n1 * factor)))
    return max(n1 + 1, round(n1 * min(2.0, 4 ** (1 / k))))

def _medir(codigo, nombre, lineas, funcion, argumentos, tamanos, presupuesto):
    _preparar(codigo, nombre, lineas)
    try:
        programa = compile(codigo, nombre, "exec")
    except SyntaxError as e:
        return _sintaxis(e, nombre)
    espacio = _espacio(nombre)
    try:
        exec(programa, espacio)
    except SystemExit:
        pass
    except BaseException as e:
        return _fallo(e)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
    f = espacio.get(str(funcion))
    if not callable(f):
        _laboratorio.medida_falla("funcion", "", 0)
        return [None, 0, None]
    contexto = dict(espacio)
    contexto.setdefault("random", random)
    contexto.setdefault("math", math)
    try:
        armar = eval(compile("lambda n: (lambda *a, **k: (a, k))(" + str(argumentos) + "\\n)", "<entrada>", "eval"), contexto)
    except SyntaxError as e:
        _laboratorio.medida_falla("entrada", _ultima_linea(e), 0)
        return [None, 0, None]
    def _sin_input(prompt=""):
        raise _PideEntrada()
    builtins.input = _sin_input
    afuera = sys.stdout
    reloj = time.perf_counter
    inicio = reloj()
    lista = [int(x) for x in tamanos]
    # Without sizes, they go by themselves (_siguiente): from 1, and they count from where a call takes _AUTO_DESDE.
    auto = not lista
    medidos = []
    contados = 0
    n = 0 if auto else lista[0]
    try:
        while True:
            if not auto:
                if len(medidos) >= len(lista):
                    break
                n = lista[len(medidos)]
            else:
                n = _siguiente(medidos)
                if contados >= _AUTO_PUNTOS or n > _AUTO_MAX_N:
                    break
            if medidos:
                n1, t1 = medidos[-1]
                # As it grew between the last two (like n² at least), three times: what wouldn't fit isn't started.
                k = 2.0
                if len(medidos) >= 2:
                    n0, t0 = medidos[-2]
                    if t0 > 0 and t1 > 0:
                        k = max(k, math.log(t1 / t0) / math.log(n1 / n0))
                if reloj() - inicio + 3 * t1 * (n / n1) ** k > presupuesto:
                    _laboratorio.medida_tope(n)
                    break
            _laboratorio.medida_empieza(n)
            try:
                armar(n)
            except BaseException as e:
                _laboratorio.medida_falla("entrada", _ultima_linea(e), n)
                return [None, 0, None]
            sys.stdout = _Nada()
            try:
                segundos, veces = _tiempo(f, armar, n)
            finally:
                sys.stdout = afuera
            medidos.append((n, segundos))
            if not auto or segundos >= _AUTO_DESDE or n >= _AUTO_SONDEO:
                _laboratorio.medida(n, segundos, veces)
                contados += 1
    except _PideEntrada:
        sys.stdout = afuera
        _laboratorio.medida_falla("input", "", 0)
        return [None, 0, None]
    except BaseException as e:
        sys.stdout = afuera
        _laboratorio.medida_falla("funcion-error", "", n)
        return _fallo(e)
    return [None, 0, None]

# Measuring the whole program: it runs as always once (what it prints and draws shows), and then up to vueltas times
# more with what it prints and draws set aside and the same answers it got. Each lap is told as it ends; one that
# wouldn't fit in the budget isn't started. The time waiting for what the student types doesn't count.
# In the first lap, sys.monitoring times each function of the project's files (only those: anything else turns its
# events off the first time), from its outermost call, so a recursive one isn't counted twice.
class _Callado:
    @staticmethod
    def imagen(*a):
        pass

class _LeeCon(io.TextIOBase):
    def __init__(self, leer):
        self._leer = leer
    def readable(self):
        return True
    def readline(self, size=-1):
        try:
            return self._leer() + chr(10)
        except EOFError:
            return ""

_MAX_FUNCIONES = 30

def _medir_programa(codigo, nombre, lineas, vueltas, presupuesto):
    _preparar(codigo, nombre, lineas)
    try:
        programa = compile(codigo, nombre, "exec")
    except SyntaxError as e:
        return _sintaxis(e, nombre)
    reloj = time.perf_counter
    mon = sys.monitoring
    ev = mon.events
    funciones = {}
    respuestas = []
    espera = [0.0]

    def _anotada(prompt=""):
        desde = reloj()
        try:
            r = _leer(prompt)
        finally:
            esperado = reloj() - desde
            espera[0] += esperado
            for f in funciones.values():
                if f[2] > 0:
                    f[3] += esperado
        respuestas.append(r)
        return r

    def _entra(code, offset, contar):
        if not _del_proyecto(code.co_filename) or code.co_name.startswith("<"):
            return mon.DISABLE
        f = funciones.get(code)
        if f is None:
            f = funciones[code] = [0, 0.0, 0, 0.0]
        if contar:
            f[0] += 1
        if f[2] == 0:
            f[3] = reloj()
        f[2] += 1

    def _sale(code):
        f = funciones.get(code)
        if f is None:
            return mon.DISABLE
        if f[2] > 0:
            f[2] -= 1
            if f[2] == 0:
                f[1] += reloj() - f[3]

    def _por_error(code, offset, e):
        if code in funciones:
            _sale(code)

    herramienta = mon.PROFILER_ID
    if mon.get_tool(herramienta) is not None:
        mon.free_tool_id(herramienta)
    mon.use_tool_id(herramienta, "laboratorio")
    mon.register_callback(herramienta, ev.PY_START, lambda c, o: _entra(c, o, True))
    mon.register_callback(herramienta, ev.PY_RESUME, lambda c, o: _entra(c, o, False))
    mon.register_callback(herramienta, ev.PY_RETURN, lambda c, o, v: _sale(c))
    mon.register_callback(herramienta, ev.PY_YIELD, lambda c, o, v: _sale(c))
    mon.register_callback(herramienta, ev.PY_UNWIND, _por_error)
    builtins.input = _anotada
    sys.stdin = _LeeCon(_anotada)
    inicio = reloj()
    mon.set_events(herramienta, ev.PY_START | ev.PY_RESUME | ev.PY_RETURN | ev.PY_YIELD | ev.PY_UNWIND)
    try:
        exec(programa, _espacio(nombre))
    except SystemExit:
        pass
    except BaseException as e:
        return _fallo(e)
    finally:
        mon.set_events(herramienta, 0)
        mon.free_tool_id(herramienta)
        sys.stdout.flush()
        sys.stderr.flush()
    primera = max(0.0, reloj() - inicio - espera[0])
    _laboratorio.medida_vuelta(1, primera)
    lista = sorted(
        ({"nombre": c.co_qualname, "archivo": c.co_filename, "llamadas": f[0], "s": f[1]} for c, f in funciones.items() if f[0]),
        key=lambda x: -x["s"],
    )
    _laboratorio.medida_funciones(json.dumps({"total": primera, "funciones": lista[:_MAX_FUNCIONES], "mas": max(0, len(lista) - _MAX_FUNCIONES)}))

    afuera, errores = sys.stdout, sys.stderr
    graficos = sys.modules.get("_laboratorio_mpl")
    envia = getattr(graficos, "_laboratorio", None)
    usado = primera
    ultima = primera
    for vuelta in range(2, int(vueltas) + 1):
        if usado + ultima > presupuesto:
            _laboratorio.medida_tope(vuelta)
            break
        _preparar(codigo, nombre, [])
        quedan = list(respuestas)

        def _repite(prompt=""):
            if not quedan:
                raise _PideEntrada()
            return quedan.pop(0)

        builtins.input = _repite
        sys.stdin = _LeeCon(_repite)
        sys.stdout = sys.stderr = _Nada()
        if graficos is not None:
            graficos._laboratorio = _Callado
        desde = reloj()
        try:
            exec(programa, _espacio(nombre))
        except SystemExit:
            pass
        except _PideEntrada:
            _laboratorio.medida_falla("input", "", vuelta)
            break
        except BaseException:
            _laboratorio.medida_falla("programa-error", "", vuelta)
            break
        finally:
            sys.stdout, sys.stderr = afuera, errores
            if graficos is not None:
                graficos._laboratorio = envia
        ultima = reloj() - desde
        usado += ultima
        _laboratorio.medida_vuelta(vuelta, ultima)
    return [None, 0, None]
`;

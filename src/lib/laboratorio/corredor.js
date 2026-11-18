// The Python that runs the student's program, loaded once in the worker (python.worker.js) before rastreo.js, with the
// file name `<laboratorio>` so the traceback leaves its frames out.
//
// The program runs in its folder (CARPETA, pyProyecto.js): there are the files of the project, and what it opens,
// creates or deletes is there. Its `.py` import each other by their name in the project (`import utiles`,
// `from modelo import Alumno`, also packages in folders): their code goes by that name, not the full path, so the
// traceback says «modelo.py», line 3, and the frames of the project are told apart from Python's (`_del_proyecto`).
// `input()` waits for what the student types in the console (JSPI); where the browser can't pause a program, it reads
// the lines written before running.
//
// `_correr(codigo, nombre, lineas)`: `codigo` is the main file, `nombre` its name. Returns [error, linea, archivo]:
// [None, 0, None] if it went well.
import { CARPETA } from './pyProyecto';

export const CORREDOR = `
import builtins, importlib.abc, importlib.machinery, io, linecache, os, sys, traceback
from pyodide.ffi import can_run_sync, run_sync
import _laboratorio

_PROPIO = "<laboratorio>"
_CARPETA = ${JSON.stringify(CARPETA)}
_ORIGINALES = dict(builtins.__dict__)
_antes = []
# Where the imports of the project look (the folder of the main file, and the project's), and what they loaded.
_raices = [""]
_cargados = set()
# The project's files are rewritten for each run: a .pyc next to them would be one more file of the student.
sys.dont_write_bytecode = True

def _del_proyecto(archivo):
    return isinstance(archivo, str) and archivo != "" and archivo[0] not in "/<"

class _Cargador(importlib.abc.SourceLoader):
    def __init__(self, archivo):
        self.archivo = archivo
    def get_filename(self, nombre):
        return self.archivo
    def get_data(self, ruta):
        with open(os.path.join(_CARPETA, ruta), "rb") as f:
            return f.read()

class _Buscador(importlib.abc.MetaPathFinder):
    def find_spec(self, nombre, ruta=None, objetivo=None):
        if ruta is None:
            if "." in nombre:
                return None
            lugares = _raices
        else:
            lugares = []
            for r in ruta:
                if not isinstance(r, str):
                    continue
                if r == _CARPETA:
                    lugares.append("")
                elif r.startswith(_CARPETA + "/"):
                    lugares.append(r[len(_CARPETA) + 1 :])
                elif _del_proyecto(r):
                    lugares.append(r)
        hoja = nombre.rpartition(".")[2]
        for lugar in lugares:
            base = lugar + "/" + hoja if lugar else hoja
            if os.path.isfile(os.path.join(_CARPETA, base, "__init__.py")):
                return self._spec(nombre, base + "/__init__.py", [base])
            if os.path.isfile(os.path.join(_CARPETA, base + ".py")):
                return self._spec(nombre, base + ".py", None)
        return None
    def _spec(self, nombre, archivo, lugares):
        _cargados.add(nombre)
        spec = importlib.machinery.ModuleSpec(nombre, _Cargador(archivo), origin=archivo, is_package=lugares is not None)
        spec.has_location = True
        if lugares is not None:
            spec.submodule_search_locations = lugares
        return spec

sys.meta_path.insert(0, _Buscador())

def _leer(prompt=""):
    prompt = str(prompt)
    if prompt:
        sys.stdout.write(prompt)
    sys.stdout.flush()
    sys.stderr.flush()
    if can_run_sync():
        linea = run_sync(_laboratorio.pedir(prompt))
    elif _antes:
        linea = _antes.pop(0)
        sys.stdout.write(linea + "\\n")
    else:
        _laboratorio.sin_pausa()
        linea = None
    if linea is None:
        raise EOFError("EOF when reading a line")
    return str(linea)

class _Entrada(io.TextIOBase):
    def readable(self):
        return True
    def readline(self, size=-1):
        try:
            return _leer() + "\\n"
        except EOFError:
            return ""
    def read(self, size=-1):
        partes = []
        while True:
            linea = self.readline()
            if not linea:
                return "".join(partes)
            partes.append(linea)

def _sin_lo_propio(e, tb):
    te = traceback.TracebackException(type(e), e, tb)
    te.stack = traceback.StackSummary.from_list([f for f in te.stack if f.filename != _PROPIO])
    return "".join(te.format())

# Before each run: Python as it came, the modules of the project to load again, and the program in its folder.
def _preparar(codigo, nombre, lineas):
    if "matplotlib.pyplot" in sys.modules:
        sys.modules["matplotlib.pyplot"].close("all")
    builtins.__dict__.clear()
    builtins.__dict__.update(_ORIGINALES)
    builtins.input = _leer
    sys.stdin = _Entrada()
    _antes[:] = list(lineas)
    for m in _cargados:
        sys.modules.pop(m, None)
    _cargados.clear()
    os.makedirs(_CARPETA, exist_ok=True)
    os.chdir(_CARPETA)
    carpeta = os.path.dirname(nombre)
    _raices[:] = [carpeta, ""] if carpeta else [""]
    for archivo in [a for a in linecache.cache if _del_proyecto(a)]:
        del linecache.cache[archivo]
    linecache.cache[nombre] = (len(codigo), None, codigo.splitlines(True), nombre)

def _sintaxis(e, nombre):
    return ["".join(traceback.format_exception_only(type(e), e)), e.lineno or 0, nombre]

# Where it broke: the last frame of the project (or, for a SyntaxError in a module it imports, that module's line).
def _fallo(e):
    tb = e.__traceback__
    while tb is not None and not _del_proyecto(tb.tb_frame.f_code.co_filename):
        tb = tb.tb_next
    linea = 0
    archivo = None
    for f in traceback.extract_tb(tb):
        if _del_proyecto(f.filename):
            linea = f.lineno or 0
            archivo = f.filename
    if isinstance(e, SyntaxError) and _del_proyecto(e.filename):
        linea = e.lineno or 0
        archivo = e.filename
    return [_sin_lo_propio(e, tb), linea, archivo]

def _espacio(nombre):
    return {"__name__": "__main__", "__file__": nombre, "__builtins__": builtins}

def _correr(codigo, nombre, lineas):
    _preparar(codigo, nombre, lineas)
    try:
        programa = compile(codigo, nombre, "exec")
    except SyntaxError as e:
        return _sintaxis(e, nombre)
    try:
        exec(programa, _espacio(nombre))
    except SystemExit as e:
        if e.code not in (None, 0):
            sys.stderr.write(str(e.code) + "\\n")
    except BaseException as e:
        return _fallo(e)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
    return [None, 0, None]
`;

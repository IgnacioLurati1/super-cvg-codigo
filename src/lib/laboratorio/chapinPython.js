// The program as a Chapin (Nassi-Shneiderman) diagram, read with Python's own `ast` in the lab's worker (python.worker.js,
// chapin.js): never run. `_chapin(codigo)` gives JSON: { ok: true, diagramas, cortado } or { ok: false, linea } (a syntax
// error) or { ok: false, largo: true }. Each diagram is { titulo, decl, cuerpo, linea }: the main program first, then each
// def. `decl` are the comments under its header (the declarations, as in El Santo Resumen) and, in the main program, the
// classes as written. Each piece of `cuerpo` is ['s', texto, linea] (a sentence), ['si', condicion, siVerdad, siNo,
// linea], ['rep', cabeza, cuerpo, linea] (Mientras or for), ['segun', cabeza, [[rotulo, cuerpo]], linea] or ['txt', codigo,
// linea]: what doesn't fit a Chapin (try, with, break, continue, an else of a loop), as it is written.
// The notation is the one of AED's exams in El Santo Resumen: `input` is Leer (its question, Mostrar, when it isn't a
// plain text), `print` is Mostrar, `while` is Mientras, `match` is Según, and the rest stays as written. import, global
// and nonlocal don't go in a diagram. String.raw: the Python goes with its backslashes as they are.
export const CHAPIN_PY = String.raw`
import ast as _c_ast
import io as _c_io
import json as _c_json
import textwrap as _c_textwrap
import tokenize as _c_tokenize

_C_TOPE = 600
_C_HONDO = 30
_C_LARGO = 300000
_C_DECL = 40
_C_LECTURAS = ("int", "float", "str", "eval")
_C_SALTEA = (_c_ast.Import, _c_ast.ImportFrom, _c_ast.Global, _c_ast.Nonlocal)
_C_DEFS = (_c_ast.FunctionDef, _c_ast.AsyncFunctionDef)
_C_SIMPLES = (_c_ast.Return, _c_ast.Assign, _c_ast.AugAssign, _c_ast.AnnAssign, _c_ast.Expr, _c_ast.Raise, _c_ast.Assert, _c_ast.Delete, _c_ast.Pass)


class _CHoja:
    def __init__(self, codigo):
        partir = getattr(_c_ast, "_splitlines_no_ff", None)
        lineas = partir(codigo) if partir else codigo.splitlines(True)
        self.b = [l.encode("utf-8") for l in lineas]
        self.cuenta = 0
        self.cortado = False

    def trozo(self, n, relleno=False):
        l1, l2, c1, c2 = n.lineno - 1, n.end_lineno - 1, n.col_offset, n.end_col_offset
        if l1 == l2:
            return self.b[l1][c1:c2].decode("utf-8", "replace")
        partes = [self.b[l1][c1:]] + self.b[l1 + 1:l2] + [self.b[l2][:c2]]
        texto = b"".join(partes).decode("utf-8", "replace")
        if relleno:
            texto = " " * len(self.b[l1][:c1].decode("utf-8", "replace")) + texto
        return texto


def _c_junto(texto):
    partes = texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    r = partes[0].rstrip()
    for p in partes[1:]:
        p = p.strip()
        if not p:
            continue
        if r.endswith("\\"):
            r = r[:-1].rstrip()
        if r.endswith(("(", "[", "{")) or p.startswith((")", "]", "}")):
            r += p
        else:
            r += " " + p
    return r


def _c_es_input(v):
    return isinstance(v, _c_ast.Call) and isinstance(v.func, _c_ast.Name) and v.func.id == "input" and not v.keywords and len(v.args) <= 1 and not any(isinstance(a, _c_ast.Starred) for a in v.args)


def _c_lectura(v):
    if _c_es_input(v):
        return v
    if isinstance(v, _c_ast.Call) and isinstance(v.func, _c_ast.Name) and v.func.id in _C_LECTURAS and len(v.args) == 1 and not v.keywords and _c_es_input(v.args[0]):
        return v.args[0]
    return None


def _c_texto(h, n):
    h.cuenta += 1
    return ["txt", _c_textwrap.dedent(h.trozo(n, True)).strip("\n"), n.lineno]


def _c_s(h, texto, n):
    h.cuenta += 1
    return ["s", texto, n.lineno]


def _c_sentencias(h, cuerpo, hondo):
    r = []
    for n in cuerpo:
        if h.cuenta >= _C_TOPE:
            h.cortado = True
            break
        r.extend(_c_sentencia(h, n, hondo))
    return r


def _c_sentencia(h, n, hondo):
    A = _c_ast
    if isinstance(n, _C_SALTEA + _C_DEFS):
        return []
    if hondo >= _C_HONDO:
        return [_c_texto(h, n)]
    if isinstance(n, A.If):
        h.cuenta += 1
        return [["si", _c_junto(h.trozo(n.test)), _c_sentencias(h, n.body, hondo + 1), _c_sentencias(h, n.orelse, hondo + 1), n.lineno]]
    if isinstance(n, A.While) and not n.orelse:
        h.cuenta += 1
        return [["rep", "Mientras " + _c_junto(h.trozo(n.test)) + ":", _c_sentencias(h, n.body, hondo + 1), n.lineno]]
    if isinstance(n, A.For) and not n.orelse:
        h.cuenta += 1
        cabeza = "for " + _c_junto(h.trozo(n.target)) + " in " + _c_junto(h.trozo(n.iter)) + ":"
        return [["rep", cabeza, _c_sentencias(h, n.body, hondo + 1), n.lineno]]
    if isinstance(n, A.Match):
        h.cuenta += 1
        casos = []
        for c in n.cases:
            rotulo = _c_junto(h.trozo(c.pattern))
            if c.guard is not None:
                rotulo += " if " + _c_junto(h.trozo(c.guard))
            casos.append([rotulo, _c_sentencias(h, c.body, hondo + 1)])
        return [["segun", "Según " + _c_junto(h.trozo(n.subject)) + ":", casos, n.lineno]]
    if isinstance(n, (A.Assign, A.AnnAssign)) and n.value is not None:
        destinos = n.targets if isinstance(n, A.Assign) else [n.target]
        leida = _c_lectura(n.value)
        if leida is not None and len(destinos) == 1:
            r = []
            if leida.args and not (isinstance(leida.args[0], A.Constant) and isinstance(leida.args[0].value, str)):
                r.append(_c_s(h, "Mostrar(" + _c_junto(h.trozo(leida.args[0])) + ")", n))
            r.append(_c_s(h, "Leer(" + _c_junto(h.trozo(destinos[0])) + ")", n))
            return r
    if isinstance(n, A.Expr) and isinstance(n.value, A.Call) and isinstance(n.value.func, A.Name) and n.value.func.id == "print":
        llamada = _c_junto(h.trozo(n.value))
        return [_c_s(h, "Mostrar" + llamada[len("print"):].lstrip(), n)]
    if isinstance(n, _C_SIMPLES):
        return [_c_s(h, _c_junto(h.trozo(n)), n)]
    return [_c_texto(h, n)]


def _c_comentarios(codigo):
    r = {}
    try:
        for t in _c_tokenize.generate_tokens(_c_io.StringIO(codigo).readline):
            if t.type == _c_tokenize.COMMENT and not t.line[:t.start[1]].strip():
                r[t.start[0]] = (t.start[1], t.string.strip())
    except Exception:
        pass
    return r


def _c_desde(n):
    return min([n.lineno] + [d.lineno for d in getattr(n, "decorator_list", [])])


def _c_defs(cuerpo, r):
    A = _c_ast
    for n in cuerpo:
        if isinstance(n, _C_DEFS):
            r.append(n)
            _c_defs(n.body, r)
        elif isinstance(n, (A.If, A.While, A.For)):
            _c_defs(n.body, r)
            _c_defs(n.orelse, r)
        elif isinstance(n, A.Match):
            for c in n.cases:
                _c_defs(c.body, r)
    return r


def _c_titulo(h, n):
    return n.name + "(" + _c_junto(_c_ast.unparse(n.args)) + ")"


def _chapin(codigo):
    codigo = str(codigo)
    if len(codigo) > _C_LARGO:
        return _c_json.dumps({"ok": False, "largo": True})
    try:
        arbol = _c_ast.parse(codigo, "<chapin>")
    except SyntaxError as e:
        return _c_json.dumps({"ok": False, "linea": e.lineno or 0})
    except (ValueError, MemoryError, RecursionError):
        return _c_json.dumps({"ok": False, "linea": 0})
    h = _CHoja(codigo)
    comentarios = _c_comentarios(codigo)
    diagramas = []
    try:
        # The main program: what isn't a def, with the comments of its level and the classes as they are written.
        ocupado = set()
        for n in arbol.body:
            ocupado.update(range(_c_desde(n), n.end_lineno + 1))
        decl = [t for l, (col, t) in sorted(comentarios.items()) if col == 0 and l not in ocupado and t.lstrip("#").strip().lower() != "programa principal"]
        for n in arbol.body:
            if isinstance(n, _c_ast.ClassDef):
                decl.extend(_c_textwrap.dedent(h.trozo(n, True)).split("\n"))
        cuerpo = _c_sentencias(h, [n for n in arbol.body if not isinstance(n, _c_ast.ClassDef)], 0)
        if cuerpo:
            diagramas.append({"titulo": "Programa principal", "decl": decl[:_C_DECL], "cuerpo": cuerpo, "linea": cuerpo[0][-1]})
        for d in _c_defs(arbol.body, []):
            if h.cuenta >= _C_TOPE:
                h.cortado = True
                break
            primera = d.body[0].lineno
            decl = [t for l, (col, t) in sorted(comentarios.items()) if d.lineno < l < primera]
            diagramas.append({"titulo": _c_titulo(h, d), "decl": decl[:_C_DECL], "cuerpo": _c_sentencias(h, d.body, 0), "linea": d.lineno})
    except RecursionError:
        return _c_json.dumps({"ok": False, "linea": 0})
    return _c_json.dumps({"ok": True, "diagramas": diagramas, "cortado": h.cortado}, ensure_ascii=False)
`;

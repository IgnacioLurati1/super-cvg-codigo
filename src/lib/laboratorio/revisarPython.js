// Python checked while the student types, without running it (revisar.js, python.worker.js): `compile()` says the
// syntax error as a run would say it, with its warnings (an `is` against a number), and pyflakes (vendor/python, from
// PyPI) the names that aren't defined and the imports that aren't used. `_revisar(codigo, nombre)` gives
// [error, linea, marcas]: the error as Python writes it (or None), and each other mark as [linea, tono, texto].
export const REVISOR_PY = `
import ast as _r_ast
import builtins as _r_builtins
import difflib as _r_difflib
import traceback as _r_traceback
import warnings as _r_warnings

_r_pyflakes = None

def _r_cargar():
    global _r_pyflakes
    if _r_pyflakes is None:
        try:
            from pyflakes import checker, messages
            _r_pyflakes = (checker, messages)
        except Exception:
            _r_pyflakes = False
    return _r_pyflakes

def _r_nombres(arbol):
    nombres = set(dir(_r_builtins))
    for n in _r_ast.walk(arbol):
        if isinstance(n, _r_ast.Name):
            nombres.add(n.id)
        elif isinstance(n, (_r_ast.FunctionDef, _r_ast.AsyncFunctionDef, _r_ast.ClassDef)):
            nombres.add(n.name)
        elif isinstance(n, _r_ast.arg):
            nombres.add(n.arg)
        elif isinstance(n, _r_ast.alias):
            nombres.add((n.asname or n.name).split(".")[0])
    return nombres

def _r_parecido(nombre, arbol):
    opciones = [x for x in _r_nombres(arbol) if x != nombre and not x.startswith("_")]
    return next(iter(_r_difflib.get_close_matches(nombre, opciones, n=1, cutoff=0.75)), None)

def _r_flakes(codigo, nombre, arbol):
    cargado = _r_cargar()
    if not cargado:
        return []
    checker, m = cargado
    marcas = []
    for msg in checker.Checker(arbol, filename=nombre).messages:
        linea = getattr(msg, "lineno", 0) or 0
        args = msg.message_args
        if isinstance(msg, m.UndefinedName):
            otro = _r_parecido(args[0], arbol)
            texto = f"\`{args[0]}\` no está definido." + (f" ¿Quisiste decir \`{otro}\`?" if otro else "")
            marcas.append([linea, "error", texto])
        elif isinstance(msg, m.UndefinedLocal):
            marcas.append([linea, "error", f"\`{args[0]}\` se usa antes de darle un valor en esta función."])
        elif isinstance(msg, m.UnusedImport):
            marcas.append([linea, "aviso", f"\`{args[0]}\` se importa y no se usa."])
    return marcas

def _revisar(codigo, nombre):
    with _r_warnings.catch_warnings(record=True) as avisos:
        _r_warnings.simplefilter("always")
        try:
            compile(codigo, nombre, "exec", dont_inherit=True)
        except SyntaxError as e:
            return ["".join(_r_traceback.format_exception_only(type(e), e)), e.lineno or 0, []]
        except (ValueError, MemoryError, RecursionError) as e:
            return [f"{type(e).__name__}: {e}", 0, []]
        marcas = [[a.lineno, "aviso", f"SyntaxWarning: {a.message}"] for a in avisos if issubclass(a.category, SyntaxWarning) and a.lineno]
        try:
            arbol = _r_ast.parse(codigo, nombre)
            marcas += _r_flakes(codigo, nombre, arbol)
        except Exception:
            pass
    return [None, 0, marcas]
`;

// matplotlib in the lab: there is no window, so a figure goes to the console as a picture. The worker installs this
// backend (MPLBACKEND=module://_laboratorio_mpl): Agg draws it, `plt.show()` and `fig.show()` send each open figure
// as PNG, and `savefig` to a file saves it and also sends it. The page gets the bytes in an `imagen` message and shows
// them as an <img> from a blob, checked first by `pngValido`.

export const MAX_IMAGEN = 4 * 1024 * 1024;
// What one run may show: a loop that shows a figure each turn fills the console.
export const MAX_IMAGENES = 30;

export const BACKEND_MATPLOTLIB = `
import io, os, warnings
from matplotlib import MatplotlibDeprecationWarning
from matplotlib.backend_bases import _Backend, FigureManagerBase
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib._pylab_helpers import Gcf
from pyodide.ffi import to_js
import _laboratorio

backend_version = "laboratorio"
# Agg itself writes it with each title in this build of matplotlib 3.10: it isn't about the student's code.
warnings.filterwarnings("ignore", message=r"The [xy] parameter as float", category=MatplotlibDeprecationWarning)

def _mostrar(figura):
    datos = io.BytesIO()
    _guardar(figura, datos, format="png")
    figura._laboratorio_mostrada = True
    _laboratorio.imagen(to_js(datos.getbuffer()))

_guardar = Figure.savefig

def _savefig(self, fname, *args, **kwargs):
    r = _guardar(self, fname, *args, **kwargs)
    if isinstance(fname, (str, os.PathLike)):
        _mostrar(self)
    return r

_savefig.__doc__ = _guardar.__doc__
Figure.savefig = _savefig

class FigureManagerLaboratorio(FigureManagerBase):
    def show(self):
        _mostrar(self.canvas.figure)

@_Backend.export
class _BackendLaboratorio(_Backend):
    FigureCanvas = FigureCanvasAgg
    FigureManager = FigureManagerLaboratorio

    @classmethod
    def show(cls, *args, **kwargs):
        for gestor in Gcf.get_all_fig_managers():
            figura = gestor.canvas.figure
            if not (getattr(figura, "_laboratorio_mostrada", False) and not figura.stale):
                _mostrar(figura)
        Gcf.destroy_all()
`;

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True if `bytes` is a PNG the console can show: its signature and not over MAX_IMAGEN. */
export function pngValido(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16 || bytes.length > MAX_IMAGEN) return false;
  return FIRMA_PNG.every((b, i) => bytes[i] === b);
}

// Compiled with each program of the lab's C, next to the library of xcc: what it lacks for WebAssembly or does
// differently from the C of a PC (gcc, the one of the classes), with the declarations added to its headers in
// cMotor.js (AGREGADOS). The FILE of xcc is the one of libsrc/stdio/_file.h (MIT, vendor/xcc/LICENSE); a test reads
// it, so a new xcc with another one doesn't go unnoticed.
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <wasi.h>

typedef struct {
  ssize_t (*read)(void *cookie, char *buf, size_t size);
  ssize_t (*write)(void *cookie, const char *buf, size_t size);
  int (*seek)(void *cookie, off_t *offset, int whence);
  int (*close)(void *cookie);
} Funciones;

struct FILE {
  const Funciones *iof;
  int (*flush)(FILE *fp);
  unsigned char *wbuf;
  unsigned char *rbuf;
  int fd;
  unsigned int rp, rs, rcapa;
  unsigned int wp, wcapa;
  unsigned int flag;
  int unget_char;
};
#define FF_EOF  (1 << 3)

extern int _detect_open_flag(const char *mode);
extern void _flush_opened_files(void);
WASI_MODULE int fd_fdstat_set_flags(int fd, int flags);

// Each function here gives way to one the student writes with the same name (their own `gets` or `trunc`), as the
// library of gcc does.
#define DEBIL  __attribute__((weak))

// ---- The keyboard and the end of the program

// Reading the keyboard first shows what was printed: the question before a scanf, as a terminal does.
DEBIL ssize_t read(int fd, void *buf, size_t size) {
  if (fd == 0) {
    fflush(stdout);
    fflush(stderr);
  }
  Iov iov;
  iov.str = buf;
  iov.n = size;
  size_t leido;
  int r = fd_read(fd, &iov, 1, &leido);
  if (r == 0)
    return leido;
  errno = EIO;
  return -1;
}

DEBIL void abort(void) {
  fflush(stdout);
  fflush(stderr);
  exit(134);
}

// What was printed and is still in the buffer, for the lab to show it when the program breaks.
DEBIL void __laboratorio_vaciar(void) {
  fflush(stdout);
  fflush(stderr);
}

// ---- Memory: malloc() gives NULL when there's no more (the sbrk of xcc doesn't check it)

extern size_t __heap_base;
static char *__laboratorio_fin = (char *)&__heap_base;

DEBIL void *sbrk(intptr_t cuanto) {
  char *antes = __laboratorio_fin;
  uintptr_t hasta = ((uintptr_t)antes + (uintptr_t)cuanto + 7) & ~(uintptr_t)7;
  if (cuanto < 0 || hasta < (uintptr_t)antes) {
    errno = ENOMEM;
    return (void *)-1;
  }
  size_t paginas = (hasta + 65535) >> 16;
  size_t hay = __builtin_wasm_memory_size(0);
  if (paginas > hay && __builtin_wasm_memory_grow(0, paginas - hay) == (size_t)-1) {
    errno = ENOMEM;
    return (void *)-1;
  }
  __laboratorio_fin = (char *)hasta;
  return antes;
}

// ---- Files

// fopen as gcc's: "a" writes at the end (xcc opens it without O_APPEND and writes over the start) and the `t` of
// Windows ("rt", "wt") is accepted and ignored.
DEBIL FILE *fopen(const char *nombre, const char *modo) {
  char limpio[8];
  int n = 0;
  for (const char *m = modo; *m != '\0' && n < 7; ++m)
    if (*m != 't')
      limpio[n++] = *m;
  limpio[n] = '\0';
  int flag = _detect_open_flag(limpio);
  if (flag == -1) {
    errno = EINVAL;
    return NULL;
  }
  int fd = open(nombre, flag & ~O_APPEND, 0644);
  if (fd < 0)
    return NULL;
  if (flag & O_APPEND)
    fd_fdstat_set_flags(fd, FDFLAGS_APPEND);
  FILE *fp = fdopen(fd, limpio);
  if (fp == NULL)
    close(fd);
  return fp;
}

// fflush(stdin) throws away what's left of the line, as on Windows (the classes use it before a scanf or a gets).
DEBIL int fflush(FILE *fp) {
  if (fp == stdin) {
    fp->rp = fp->rs = 0;
    fp->unget_char = EOF;
    lseek(0, 0, SEEK_END);
    return 0;
  }
  if (fp != NULL)
    return (fp->flush)(fp);
  int r = 0;
  if ((stdout->flush)(stdout) != 0)
    r = EOF;
  if ((stderr->flush)(stderr) != 0)
    r = EOF;
  _flush_opened_files();
  return r;
}

// Where the program is in the file: what the file says, plus what's still to write, minus what was read ahead and
// what went back with ungetc (xcc forgets this last one).
DEBIL long ftell(FILE *fp) {
  off_t o = 0;
  if ((fp->iof->seek)(fp, &o, SEEK_CUR) < 0)
    return -1;
  return (long)o + (long)fp->wp - (long)(fp->rs - fp->rp) - (fp->unget_char != EOF ? 1 : 0);
}

// xcc moves SEEK_CUR from where the file was read ahead to, not from where the program is: the classic
// `fseek(f, -sizeof r, SEEK_CUR)` after an fread wrote over another record. Here it goes from ftell, and an
// fseek(f, 0, SEEK_CUR) between reading and writing also leaves the buffer empty, as C asks.
DEBIL int fseek(FILE *fp, long offset, int origin) {
  if (origin == SEEK_CUR) {
    long actual = ftell(fp);
    if (actual < 0)
      return -1;
    offset += actual;
    origin = SEEK_SET;
  }
  if (origin == SEEK_SET && offset < 0) {
    errno = EINVAL;
    return -1;
  }
  fflush(fp);
  off_t o = offset;
  if ((fp->iof->seek)(fp, &o, origin) == -1)
    return -1;
  return 0;
}

DEBIL void clearerr(FILE *fp) {
  fp->flag &= ~FF_EOF;
}

// The files live in memory: there are no reading or writing errors to remember.
DEBIL int ferror(FILE *fp) {
  (void)fp;
  return 0;
}

DEBIL void rewind(FILE *fp) {
  fseek(fp, 0, SEEK_SET);
  clearerr(fp);
}

DEBIL int fgetpos(FILE *fp, fpos_t *pos) {
  long donde = ftell(fp);
  if (donde < 0)
    return -1;
  *pos = donde;
  return 0;
}

DEBIL int fsetpos(FILE *fp, const fpos_t *pos) {
  return fseek(fp, *pos, SEEK_SET);
}

// The buffer of each file stays as it is.
DEBIL int setvbuf(FILE *fp, char *buf, int modo, size_t tam) {
  (void)fp;
  (void)buf;
  (void)modo;
  (void)tam;
  return 0;
}

DEBIL void setbuf(FILE *fp, char *buf) {
  (void)fp;
  (void)buf;
}

// Out of C since C11, but in the classes: reads a line without its Enter, with no limit.
DEBIL char *gets(char *s) {
  int c = getchar();
  if (c == EOF)
    return NULL;
  char *p = s;
  while (c != EOF && c != '\n') {
    *p++ = c;
    c = getchar();
  }
  *p = '\0';
  return s;
}

// ---- scanf and its family: the one of xcc doesn't know %c, %[ ], %x or %o, nor a space before them, and stops there.

typedef struct {
  FILE *fp;
  const char *s;
  int leidos;
} Fuente;

static int sig(Fuente *f) {
  int c;
  if (f->fp != NULL)
    c = fgetc(f->fp);
  else
    c = *f->s != '\0' ? (unsigned char)*f->s++ : EOF;
  if (c != EOF)
    f->leidos++;
  return c;
}

static void devolver(Fuente *f, int c) {
  if (c == EOF)
    return;
  f->leidos--;
  if (f->fp != NULL)
    ungetc(c, f->fp);
  else
    f->s--;
}

static int valor_digito(int c, int base) {
  int v = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'z' ? c - 'a' + 10 : c >= 'A' && c <= 'Z' ? c - 'A' + 10 : 99;
  return v < base ? v : -1;
}

enum { T_INT, T_CHAR, T_SHORT, T_LONG, T_LLONG, T_SIZE, T_LDOUBLE };

static void guardar_entero(void *p, int tam, unsigned long long v) {
  switch (tam) {
  case T_CHAR:  *(char *)p = (char)v; break;
  case T_SHORT: *(short *)p = (short)v; break;
  case T_LONG:  *(long *)p = (long)v; break;
  case T_LLONG: *(long long *)p = (long long)v; break;
  case T_SIZE:  *(size_t *)p = (size_t)v; break;
  default:      *(int *)p = (int)v; break;
  }
}

static bool letra_igual(int c, int letra) {
  return c != EOF && tolower(c) == letra;
}

// Reads the text of a number with a point into `buf`; how many letters it read, without what came after.
static int leer_real(Fuente *f, char *buf, int max, int *ultimo) {
  int n = 0;
  int c = sig(f);
  if ((c == '+' || c == '-') && n < max) {
    buf[n++] = c;
    c = sig(f);
  }
  // inf, infinity and nan
  if (letra_igual(c, 'i') || letra_igual(c, 'n')) {
    const char *palabra = letra_igual(c, 'i') ? "infinity" : "nan";
    int i = 0;
    while (palabra[i] != '\0' && n < max && letra_igual(c, palabra[i])) {
      buf[n++] = c;
      c = sig(f);
      ++i;
    }
    *ultimo = c;
    return n;
  }
  bool digitos = false;
  while (n < max && c >= '0' && c <= '9') {
    buf[n++] = c;
    digitos = true;
    c = sig(f);
  }
  if (n < max && c == '.') {
    buf[n++] = c;
    c = sig(f);
    while (n < max && c >= '0' && c <= '9') {
      buf[n++] = c;
      digitos = true;
      c = sig(f);
    }
  }
  if (digitos && n < max && (c == 'e' || c == 'E')) {
    buf[n++] = c;
    c = sig(f);
    if (n < max && (c == '+' || c == '-')) {
      buf[n++] = c;
      c = sig(f);
    }
    while (n < max && c >= '0' && c <= '9') {
      buf[n++] = c;
      c = sig(f);
    }
  }
  *ultimo = c;
  return n;
}

static int escanear(Fuente *f, const char *formato, va_list ap) {
  const unsigned char *fmt = (const unsigned char *)formato;
  int asignados = 0;
  bool alguna = false;  // A conversion was done: the end of the input is no longer EOF.
  int c;
#define FALLA_ENTRADA()  return alguna || asignados > 0 ? asignados : EOF

  for (; *fmt != '\0'; ++fmt) {
    if (isspace(*fmt)) {
      while (isspace(c = sig(f)))
        ;
      devolver(f, c);
      continue;
    }
    if (*fmt != '%' || fmt[1] == '%') {
      if (*fmt == '%') {
        ++fmt;
        while (isspace(c = sig(f)))
          ;
      } else {
        c = sig(f);
      }
      if (c != *fmt) {
        devolver(f, c);
        if (c == EOF)
          FALLA_ENTRADA();
        return asignados;
      }
      continue;
    }

    ++fmt;
    bool suprimir = false;
    if (*fmt == '*') {
      suprimir = true;
      ++fmt;
    }
    int ancho = 0;
    while (*fmt >= '0' && *fmt <= '9')
      ancho = ancho * 10 + (*fmt++ - '0');
    int tam = T_INT;
    if (*fmt == 'h') {
      tam = T_SHORT;
      if (*++fmt == 'h') {
        tam = T_CHAR;
        ++fmt;
      }
    } else if (*fmt == 'l') {
      tam = T_LONG;
      if (*++fmt == 'l') {
        tam = T_LLONG;
        ++fmt;
      }
    } else if (*fmt == 'L' || *fmt == 'q' || *fmt == 'j') {
      tam = *fmt == 'L' ? T_LDOUBLE : T_LLONG;
      ++fmt;
    } else if (*fmt == 'z' || *fmt == 't') {
      tam = T_SIZE;
      ++fmt;
    }
    int conv = *fmt;
    if (conv == '\0')
      break;

    if (conv == 'n') {
      if (!suprimir)
        guardar_entero(va_arg(ap, void *), tam, (unsigned long long)f->leidos);
      continue;
    }
    if (conv != 'c' && conv != '[') {
      while (isspace(c = sig(f)))
        ;
      devolver(f, c);
    }

    switch (conv) {
    case 'd': case 'i': case 'u': case 'o': case 'x': case 'X': case 'p':
      {
        int base = conv == 'o' ? 8 : conv == 'x' || conv == 'X' || conv == 'p' ? 16 : conv == 'i' ? 0 : 10;
        int max = ancho > 0 ? ancho : INT_MAX;
        int n = 0;
        bool negativo = false, digitos = false;
        unsigned long long v = 0;
        c = sig(f);
        if (n < max && (c == '+' || c == '-')) {
          negativo = c == '-';
          ++n;
          c = sig(f);
        }
        if ((base == 0 || base == 16) && n < max && c == '0') {
          ++n;
          digitos = true;
          c = sig(f);
          if (n < max && (c == 'x' || c == 'X')) {
            base = 16;
            ++n;
            c = sig(f);
          } else if (base == 0) {
            base = 8;
          }
        }
        if (base == 0)
          base = 10;
        int d;
        while (n < max && (d = valor_digito(c, base)) >= 0) {
          v = v * base + d;
          digitos = true;
          ++n;
          c = sig(f);
        }
        devolver(f, c);
        if (!digitos) {
          if (c == EOF && n == 0)
            FALLA_ENTRADA();
          return asignados;
        }
        if (negativo)
          v = -v;
        alguna = true;
        if (!suprimir) {
          if (conv == 'p')
            *va_arg(ap, void **) = (void *)(uintptr_t)v;
          else
            guardar_entero(va_arg(ap, void *), tam, v);
          ++asignados;
        }
      }
      break;
    case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': case 'a': case 'A':
      {
        char buf[128];
        int max = ancho > 0 && ancho < (int)sizeof(buf) - 1 ? ancho : (int)sizeof(buf) - 1;
        int ultimo;
        int n = leer_real(f, buf, max, &ultimo);
        devolver(f, ultimo);
        buf[n] = '\0';
        char *fin;
        double v = strtod(buf, &fin);
        if (n == 0 || fin == buf) {
          if (n == 0 && ultimo == EOF)
            FALLA_ENTRADA();
          return asignados;
        }
        alguna = true;
        if (!suprimir) {
          if (tam == T_LONG)
            *va_arg(ap, double *) = v;
          else if (tam == T_LDOUBLE)
            *va_arg(ap, long double *) = v;
          else
            *va_arg(ap, float *) = (float)v;
          ++asignados;
        }
      }
      break;
    case 'c':
      {
        int max = ancho > 0 ? ancho : 1;
        char *destino = suprimir ? NULL : va_arg(ap, char *);
        int n = 0;
        while (n < max && (c = sig(f)) != EOF) {
          if (destino != NULL)
            destino[n] = c;
          ++n;
        }
        if (n == 0)
          FALLA_ENTRADA();
        alguna = true;
        if (!suprimir)
          ++asignados;
      }
      break;
    case 's': case '[':
      {
        bool en[256];
        if (conv == 's') {
          for (int i = 0; i < 256; ++i)
            en[i] = !isspace(i);
        } else {
          ++fmt;
          bool negar = false;
          if (*fmt == '^') {
            negar = true;
            ++fmt;
          }
          for (int i = 0; i < 256; ++i)
            en[i] = false;
          bool primero = true;
          for (; *fmt != '\0' && (*fmt != ']' || primero); ++fmt) {
            primero = false;
            if (fmt[1] == '-' && fmt[2] != ']' && fmt[2] != '\0') {
              for (int i = fmt[0]; i <= fmt[2]; ++i)
                en[i] = true;
              fmt += 2;
            } else {
              en[*fmt] = true;
            }
          }
          if (*fmt == '\0')
            --fmt;
          if (negar)
            for (int i = 0; i < 256; ++i)
              en[i] = !en[i];
          en[0] = false;
        }
        int max = ancho > 0 ? ancho : INT_MAX;
        char *destino = suprimir ? NULL : va_arg(ap, char *);
        int n = 0;
        while (n < max && (c = sig(f)) != EOF && en[c]) {
          if (destino != NULL)
            destino[n] = c;
          ++n;
        }
        if (n < max)
          devolver(f, c);
        if (n == 0) {
          if (c == EOF)
            FALLA_ENTRADA();
          return asignados;
        }
        alguna = true;
        if (destino != NULL) {
          destino[n] = '\0';
          ++asignados;
        }
      }
      break;
    default:
      return asignados;
    }
  }
  return asignados;
#undef FALLA_ENTRADA
}

DEBIL int vfscanf(FILE *restrict fp, const char *restrict formato, va_list ap) {
  Fuente f = {fp, NULL, 0};
  return escanear(&f, formato, ap);
}

DEBIL int vsscanf(const char *restrict s, const char *restrict formato, va_list ap) {
  Fuente f = {NULL, s, 0};
  return escanear(&f, formato, ap);
}

DEBIL int vscanf(const char *restrict formato, va_list ap) {
  return vfscanf(stdin, formato, ap);
}

DEBIL int scanf(const char *restrict formato, ...) {
  va_list ap;
  va_start(ap, formato);
  int r = vfscanf(stdin, formato, ap);
  va_end(ap);
  return r;
}

DEBIL int fscanf(FILE *restrict fp, const char *restrict formato, ...) {
  va_list ap;
  va_start(ap, formato);
  int r = vfscanf(fp, formato, ap);
  va_end(ap);
  return r;
}

DEBIL int sscanf(const char *restrict s, const char *restrict formato, ...) {
  va_list ap;
  va_start(ap, formato);
  int r = vsscanf(s, formato, ap);
  va_end(ap);
  return r;
}

// ---- stdlib.h

DEBIL div_t div(int a, int b) {
  div_t r;
  r.quot = a / b;
  r.rem = a % b;
  return r;
}

DEBIL ldiv_t ldiv(long a, long b) {
  ldiv_t r;
  r.quot = a / b;
  r.rem = a % b;
  return r;
}

DEBIL lldiv_t lldiv(long long a, long long b) {
  lldiv_t r;
  r.quot = a / b;
  r.rem = a % b;
  return r;
}

DEBIL float strtof(const char *restrict p, char **restrict fin) {
  return (float)strtod(p, fin);
}

// ---- string.h and ctype.h

// The one of xcc gives 32 for "abc" and "ABC".
DEBIL int strcasecmp(const char *p, const char *q) {
  for (;; ++p, ++q) {
    int d = tolower(*(const unsigned char *)p) - tolower(*(const unsigned char *)q);
    if (d != 0 || *p == '\0')
      return d;
  }
}

DEBIL size_t strxfrm(char *restrict destino, const char *restrict origen, size_t n) {
  size_t largo = strlen(origen);
  if (n > 0) {
    size_t copia = largo < n - 1 ? largo : n - 1;
    memcpy(destino, origen, copia);
    destino[copia] = '\0';
  }
  return largo;
}

DEBIL int isblank(int c) {
  return c == ' ' || c == '\t';
}

// ---- math.h: what xcc lacks, from what it has

DEBIL double trunc(double x) {
  if (x != x || x == INFINITY || x == -INFINITY)
    return x;
  return x < 0 ? ceil(x) : floor(x);
}

DEBIL double rint(double x) {
  if (x != x || x == INFINITY || x == -INFINITY)
    return x;
  double f = floor(x);
  double d = x - f;
  if (d > 0.5 || (d == 0.5 && fmod(f, 2.0) != 0))
    f += 1;
  return f == 0 ? copysign(0.0, x) : f;
}

DEBIL double nearbyint(double x) { return rint(x); }
DEBIL long lrint(double x) { return (long)rint(x); }
DEBIL long long llrint(double x) { return (long long)rint(x); }
DEBIL long lround(double x) { return (long)round(x); }
DEBIL long long llround(double x) { return (long long)round(x); }

DEBIL double hypot(double x, double y) {
  double a = fabs(x), b = fabs(y);
  if (a == INFINITY || b == INFINITY)
    return INFINITY;
  if (a < b) {
    double t = a;
    a = b;
    b = t;
  }
  if (a == 0)
    return 0;
  double r = b / a;
  return a * sqrt(1 + r * r);
}

DEBIL double cbrt(double x) {
  if (x == 0 || x != x || x == INFINITY || x == -INFINITY)
    return x;
  double y = pow(fabs(x), 1.0 / 3.0);
  y -= (y * y * y - fabs(x)) / (3 * y * y);
  return x < 0 ? -y : y;
}

DEBIL double exp2(double x) { return pow(2.0, x); }

DEBIL double expm1(double x) {
  if (fabs(x) < 1e-5)
    return x + x * x / 2 + x * x * x / 6;
  return exp(x) - 1;
}

DEBIL double log1p(double x) {
  if (fabs(x) < 1e-4)
    return x - x * x / 2 + x * x * x / 3;
  return log(1 + x);
}

DEBIL double fmin(double a, double b) { return a != a ? b : b != b ? a : a < b ? a : b; }
DEBIL double fmax(double a, double b) { return a != a ? b : b != b ? a : a > b ? a : b; }
DEBIL double fdim(double a, double b) { return a > b ? a - b : 0; }
DEBIL double fma(double a, double b, double c) { return a * b + c; }

DEBIL double remainder(double x, double y) {
  return x - rint(x / y) * y;
}

DEBIL float sqrtf(float x) { return (float)sqrt(x); }
DEBIL float powf(float x, float y) { return (float)pow(x, y); }
DEBIL float sinf(float x) { return (float)sin(x); }
DEBIL float cosf(float x) { return (float)cos(x); }
DEBIL float tanf(float x) { return (float)tan(x); }
DEBIL float asinf(float x) { return (float)asin(x); }
DEBIL float acosf(float x) { return (float)acos(x); }
DEBIL float atanf(float x) { return (float)atan(x); }
DEBIL float atan2f(float y, float x) { return (float)atan2(y, x); }
DEBIL float expf(float x) { return (float)exp(x); }
DEBIL float logf(float x) { return (float)log(x); }
DEBIL float log10f(float x) { return (float)log10(x); }
DEBIL float log2f(float x) { return (float)log2(x); }
DEBIL float floorf(float x) { return (float)floor(x); }
DEBIL float ceilf(float x) { return (float)ceil(x); }
DEBIL float roundf(float x) { return (float)round(x); }
DEBIL float truncf(float x) { return (float)trunc(x); }
DEBIL float fmodf(float x, float y) { return (float)fmod(x, y); }
DEBIL float hypotf(float x, float y) { return (float)hypot(x, y); }
DEBIL float cbrtf(float x) { return (float)cbrt(x); }
DEBIL float fminf(float a, float b) { return (float)fmin(a, b); }
DEBIL float fmaxf(float a, float b) { return (float)fmax(a, b); }

// ---- time.h: clock() counts from the start; the dates go in the zone of the device (LABORATORIO_ZONA, minutes
// east of UTC, set by the lab).

DEBIL clock_t clock(void) {
  uint64_t ns = 0;
  clock_time_get(2, 1000, &ns);
  return (clock_t)(ns / 1000);
}

DEBIL double difftime(time_t fin, time_t inicio) {
  return (double)fin - (double)inicio;
}

static long zona_en_segundos(void) {
  const char *z = getenv("LABORATORIO_ZONA");
  return z != NULL ? atol(z) * 60 : 0;
}

// Days since 1970-01-01 of a date of the proleptic Gregorian calendar (Howard Hinnant's algorithm).
static long long dias_desde_1970(long long y, int m, int d) {
  y -= m <= 2;
  long long era = (y >= 0 ? y : y - 399) / 400;
  long long yoe = y - era * 400;
  long long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  long long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe - 719468;
}

static struct tm *a_fecha(long long t, struct tm *r) {
  long long dias = t / 86400;
  long long seg = t % 86400;
  if (seg < 0) {
    seg += 86400;
    dias -= 1;
  }
  r->tm_hour = (int)(seg / 3600);
  r->tm_min = (int)(seg / 60 % 60);
  r->tm_sec = (int)(seg % 60);
  r->tm_wday = (int)((dias % 7 + 11) % 7);  // 1970-01-01 was a Thursday.
  long long z = dias + 719468;
  long long era = (z >= 0 ? z : z - 146096) / 146097;
  long long doe = z - era * 146097;
  long long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  long long y = yoe + era * 400;
  long long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  long long mp = (5 * doy + 2) / 153;
  int d = (int)(doy - (153 * mp + 2) / 5 + 1);
  int m = (int)(mp < 10 ? mp + 3 : mp - 9);
  y += m <= 2;
  r->tm_year = (int)(y - 1900);
  r->tm_mon = m - 1;
  r->tm_mday = d;
  r->tm_yday = (int)(dias - dias_desde_1970(y, 1, 1));
  r->tm_isdst = 0;
  return r;
}

static struct tm la_fecha;

DEBIL struct tm *gmtime(const time_t *t) {
  return a_fecha(*t, &la_fecha);
}

DEBIL struct tm *localtime(const time_t *t) {
  return a_fecha((long long)*t + zona_en_segundos(), &la_fecha);
}

DEBIL struct tm *gmtime_r(const time_t *t, struct tm *r) {
  return a_fecha(*t, r);
}

DEBIL struct tm *localtime_r(const time_t *t, struct tm *r) {
  return a_fecha((long long)*t + zona_en_segundos(), r);
}

DEBIL time_t mktime(struct tm *f) {
  long long mes = f->tm_mon;
  long long anio = (long long)f->tm_year + 1900 + (mes >= 0 ? mes / 12 : (mes - 11) / 12);
  mes = ((mes % 12) + 12) % 12;
  long long t = dias_desde_1970(anio, (int)mes + 1, 1) + f->tm_mday - 1;
  t = t * 86400 + (long long)f->tm_hour * 3600 + (long long)f->tm_min * 60 + f->tm_sec;
  t -= zona_en_segundos();
  a_fecha(t + zona_en_segundos(), f);
  return (time_t)t;
}

static const char *const kDias[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
static const char *const kMeses[] = {"January", "February", "March", "April", "May", "June", "July", "August",
                                     "September", "October", "November", "December"};

DEBIL size_t strftime(char *restrict s, size_t max, const char *restrict formato, const struct tm *restrict f) {
  size_t n = 0;
  char tmp[64];
#define PONER(texto) \
  do { \
    for (const char *q = (texto); *q != '\0'; ++q) { \
      if (n + 1 >= max) \
        return 0; \
      s[n++] = *q; \
    } \
  } while (0)
  for (const char *p = formato; *p != '\0'; ++p) {
    if (*p != '%' || p[1] == '\0') {
      tmp[0] = *p;
      tmp[1] = '\0';
      PONER(tmp);
      continue;
    }
    int dia = f->tm_wday >= 0 && f->tm_wday < 7 ? f->tm_wday : 0;
    int mes = f->tm_mon >= 0 && f->tm_mon < 12 ? f->tm_mon : 0;
    int hora12 = f->tm_hour % 12 == 0 ? 12 : f->tm_hour % 12;
    switch (*++p) {
    case 'Y': snprintf(tmp, sizeof tmp, "%d", f->tm_year + 1900); break;
    case 'y': snprintf(tmp, sizeof tmp, "%02d", (f->tm_year + 1900) % 100); break;
    case 'C': snprintf(tmp, sizeof tmp, "%02d", (f->tm_year + 1900) / 100); break;
    case 'm': snprintf(tmp, sizeof tmp, "%02d", f->tm_mon + 1); break;
    case 'd': snprintf(tmp, sizeof tmp, "%02d", f->tm_mday); break;
    case 'e': snprintf(tmp, sizeof tmp, "%2d", f->tm_mday); break;
    case 'j': snprintf(tmp, sizeof tmp, "%03d", f->tm_yday + 1); break;
    case 'H': snprintf(tmp, sizeof tmp, "%02d", f->tm_hour); break;
    case 'I': snprintf(tmp, sizeof tmp, "%02d", hora12); break;
    case 'M': snprintf(tmp, sizeof tmp, "%02d", f->tm_min); break;
    case 'S': snprintf(tmp, sizeof tmp, "%02d", f->tm_sec); break;
    case 'p': snprintf(tmp, sizeof tmp, "%s", f->tm_hour < 12 ? "AM" : "PM"); break;
    case 'a': snprintf(tmp, sizeof tmp, "%.3s", kDias[dia]); break;
    case 'A': snprintf(tmp, sizeof tmp, "%s", kDias[dia]); break;
    case 'b': case 'h': snprintf(tmp, sizeof tmp, "%.3s", kMeses[mes]); break;
    case 'B': snprintf(tmp, sizeof tmp, "%s", kMeses[mes]); break;
    case 'u': snprintf(tmp, sizeof tmp, "%d", dia == 0 ? 7 : dia); break;
    case 'w': snprintf(tmp, sizeof tmp, "%d", dia); break;
    case 'F': snprintf(tmp, sizeof tmp, "%d-%02d-%02d", f->tm_year + 1900, f->tm_mon + 1, f->tm_mday); break;
    case 'D': case 'x': snprintf(tmp, sizeof tmp, "%02d/%02d/%02d", f->tm_mon + 1, f->tm_mday, (f->tm_year + 1900) % 100); break;
    case 'T': case 'X': snprintf(tmp, sizeof tmp, "%02d:%02d:%02d", f->tm_hour, f->tm_min, f->tm_sec); break;
    case 'R': snprintf(tmp, sizeof tmp, "%02d:%02d", f->tm_hour, f->tm_min); break;
    case 'r': snprintf(tmp, sizeof tmp, "%02d:%02d:%02d %s", hora12, f->tm_min, f->tm_sec, f->tm_hour < 12 ? "AM" : "PM"); break;
    case 'c':
      snprintf(tmp, sizeof tmp, "%.3s %.3s %2d %02d:%02d:%02d %d", kDias[dia], kMeses[mes], f->tm_mday, f->tm_hour,
               f->tm_min, f->tm_sec, f->tm_year + 1900);
      break;
    case 'z':
      {
        long z = zona_en_segundos() / 60;
        snprintf(tmp, sizeof tmp, "%c%02ld%02ld", z < 0 ? '-' : '+', (z < 0 ? -z : z) / 60, (z < 0 ? -z : z) % 60);
      }
      break;
    case 'Z': tmp[0] = '\0'; break;
    case 'n': snprintf(tmp, sizeof tmp, "\n"); break;
    case 't': snprintf(tmp, sizeof tmp, "\t"); break;
    case '%': snprintf(tmp, sizeof tmp, "%%"); break;
    default: snprintf(tmp, sizeof tmp, "%%%c", *p); break;
    }
    PONER(tmp);
  }
#undef PONER
  if (max == 0)
    return 0;
  s[n] = '\0';
  return n;
}

static char el_texto[32];

DEBIL char *asctime(const struct tm *f) {
  int dia = f->tm_wday >= 0 && f->tm_wday < 7 ? f->tm_wday : 0;
  int mes = f->tm_mon >= 0 && f->tm_mon < 12 ? f->tm_mon : 0;
  snprintf(el_texto, sizeof el_texto, "%.3s %.3s%3d %02d:%02d:%02d %d\n", kDias[dia], kMeses[mes], f->tm_mday,
           f->tm_hour, f->tm_min, f->tm_sec, f->tm_year + 1900);
  return el_texto;
}

DEBIL char *ctime(const time_t *t) {
  return asctime(localtime(t));
}

// ---- system(): what code written on Windows calls

// The lab has no shell, but two calls are in almost every program written on Windows: «pause» goes on (there's no
// window that closes), and «cls» (or «clear») clears the console, with the sequence of a terminal that the worker
// turns into that (c.worker.js). Anything else says it can't and returns -1, as a system() whose command failed.
DEBIL int system(const char *orden) {
  if (!orden) return 0;
  char o[16];
  size_t n = 0;
  while (*orden == ' ') orden++;
  while (orden[n] && orden[n] != ' ' && n < sizeof o - 1) {
    o[n] = (char)tolower((unsigned char)orden[n]);
    n++;
  }
  o[n] = '\0';
  if (!strcmp(o, "pause")) return 0;
  if (!strcmp(o, "cls") || !strcmp(o, "clear")) {
    fflush(stdout);
    fputs("\x1b[2J\x1b[H", stdout);
    fflush(stdout);
    return 0;
  }
  fflush(stdout);
  fprintf(stderr, "system(\"%s\") no anda en el laboratorio: solo \"pause\" y \"cls\".\n", orden);
  return -1;
}

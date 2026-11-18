// printf and its family for the lab's C. From xcc (libsrc/stdio/vfprintf.c, MIT, Copyright (c) 2024 tyfkda; see
// vendor/xcc/LICENSE): its number formatting as it is, and a new reading of the format that also knows the `h`, `hh`,
// `j` and `t` sizes, the space flag, the width of `%c`, `%.0s`, the precision of integers and `%n`. Without these, a
// `%hd` came out as text and threw the rest of the arguments out of place.
#include <ctype.h>
#include <limits.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>

// The FILE of xcc (libsrc/stdio/_file.h): only the first field is used here, to write one letter.
typedef struct {
  ssize_t (*read)(void *cookie, char *buf, size_t size);
  ssize_t (*write)(void *cookie, const char *buf, size_t size);
} __LaboratorioFunciones;

struct FILE {
  const __LaboratorioFunciones *iof;
};

static inline int _fputc(int c, FILE *fp) {
  unsigned char _buf = c;
  ssize_t _result = (fp->iof->write)(fp, (char*)&_buf, sizeof(_buf));
  return _result == sizeof(_buf) ? (int)_buf : EOF;
}


#define PRINTF_BUFSIZ  (32)
#define MIN(a, b)  ((a) < (b) ? (a) : (b))
#define STATIC_ASSERT(cond)  char __dummy[(cond) ? 0 : -1]; (void)__dummy

static const char kHexDigits[] = "0123456789abcdef";
static const char kUpperHexDigits[] = "0123456789ABCDEF";

static int putnstr(FILE *fp, int n, const char *s) {
  int i;
  for (i = 0; i < n && s[i] != '\0'; ++i)
    ;
  return fwrite(s, 1, i, fp);
}

static void putpadding(FILE *fp, int m, char padding) {
  if (m <= 0)
    return;
  char buf[16];
  int n = MIN(m, (int)sizeof(buf));
  memset(buf, padding, n);
  do {
    int i = MIN(m, n);
    fwrite(buf, 1, i, fp);
    m -= i;
  } while (m > 0);
}

#ifndef __NO_FLONUM
#include "math.h"  // isfinite, signbit

static long double pow10(int order) {
  long double a = 1, x = 10;
  for (; order > 0; order >>= 1) {
    if ((order & 1) != 0)
      a *= x;
    x *= x;
  }
  return a;
}

// Float conversions (%f %F %e %E %g %G) following C99: field width, the
// '-', '0', '+' and '#' flags, and precision (including .0).

// The exact rounding error of the product p = a * b (Dekker's two-product,
// for 53-bit doubles: long double is a double on this target). Its sign says
// whether the true product is above or below p.
static long double product_error(long double a, long double b, long double p) {
  const long double split = 134217729.0;  // 2^27 + 1
  long double t = split * a;
  long double ahi = t - (t - a), alo = a - ahi;
  t = split * b;
  long double bhi = t - (t - b), blo = b - bhi;
  return ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo;
}

// Appends `x` (0 <= x < 1e18) with `prec` decimals to `p`; returns the end.
// Rounds to nearest using the exact value of x, and true ties to even, as glibc does.
// Digits past the 18th decimal are written as zeros.
static char *put_fixed(char *p, long double x, int prec, bool alt) {
  int extra = 0;
  if (prec > 18) {
    extra = (prec > 300 ? 300 : prec) - 18;
    prec = 18;
  }
  unsigned long long int_part = (unsigned long long)x;
  long double one = pow10(prec);
  long double part = x - (long double)int_part;
  long double scaled = part * one;
  unsigned long long frac = (unsigned long long)scaled;
  long double rest = scaled - (long double)frac;
  if (rest == 0.5) {
    // Looks like a tie, but the multiplication may have rounded: 0.05 * 10 is
    // just over 0.5 exactly, so it rounds up; 2.5 really is a tie, so it goes to even.
    long double err = product_error(part, one, scaled);
    if (err > 0 || (err == 0 && ((prec > 0 ? frac : int_part) & 1) != 0))
      ++frac;
  } else if (rest > 0.5) {
    ++frac;
  }
  if ((long double)frac >= one) {
    ++int_part;
    frac -= (unsigned long long)one;
  }
  char digits[24];
  int n = 0;
  do {
    digits[n++] = '0' + (char)(int_part % 10);
    int_part /= 10;
  } while (int_part != 0);
  while (n > 0)
    *p++ = digits[--n];
  if (prec > 0 || alt)
    *p++ = '.';
  for (int i = prec - 1; i >= 0; --i) {
    p[i] = '0' + (char)(frac % 10);
    frac /= 10;
  }
  p += prec;
  for (; extra > 0; --extra)
    *p++ = '0';
  return p;
}

// Splits x > 0 into m * 10^e with 1 <= m < 10.
static int decimal_exponent(long double *px) {
  static const long double kPowers[] = {
    1e256, 1e128, 1e64, 1e32, 1e16, 1e8, 1e4, 1e2, 1e1
  };
  const int N = sizeof(kPowers) / sizeof(*kPowers);
  const int kPowerIndex = 256;

  long double x = *px;
  int e = 0;

  if (x >= 10) {
    for (int i = 0; i < N; ++i) {
      long double p = kPowers[i];
      if (x >= p) {
        x /= p;
        e += kPowerIndex >> i;
      }
    }
  } else if (x < 1) {
    for (int i = 0; i < N; ++i) {
      long double y = x * kPowers[i];
      if (y < 10.0) {
        x = y;
        e -= kPowerIndex >> i;
      }
    }
  }
  *px = x;
  return e;
}

static char *put_scientific(char *p, long double x, int prec, bool alt, bool upper, int *pexp) {
  int e = 0;
  if (x != 0) {
    e = decimal_exponent(&x);
    // Rounding can carry to 10.0: renormalise.
    long double one = pow10(prec > 18 ? 18 : prec);
    if ((long double)(unsigned long long)(x * one + 0.5) >= 10 * one) {
      x /= 10;
      ++e;
    }
  }
  p = put_fixed(p, x, prec, alt);
  *p++ = upper ? 'E' : 'e';
  *p++ = e < 0 ? '-' : '+';
  int ae = e < 0 ? -e : e;
  if (ae >= 100)
    *p++ = '0' + (char)(ae / 100);
  *p++ = '0' + (char)((ae / 10) % 10);
  *p++ = '0' + (char)(ae % 10);
  if (pexp != NULL)
    *pexp = e;
  return p;
}

static char *strip_zeros(char *start, char *p) {
  char *dot = NULL;
  for (char *q = start; q < p; ++q)
    if (*q == '.')
      dot = q;
  if (dot == NULL)
    return p;
  while (p > dot + 1 && p[-1] == '0')
    --p;
  if (p == dot + 1)
    --p;
  return p;
}

static int printflonum(FILE *fp, long double x, int conv, int width, int prec, char sign,
                       bool leftalign, char padding, bool alt) {
  char body[400];   // sign + up to 18 digits + '.' + at most 300 decimals + exponent
  char *p = body;
  bool upper = conv == 'F' || conv == 'E' || conv == 'G';
  bool neg = signbit(x);
  if (neg)
    x = -x;
  if (neg)
    *p++ = '-';
  else if (sign != 0)
    *p++ = sign;
  char *digits = p;
  if (!isfinite(x)) {
    const char *s = isnan(x) ? (upper ? "NAN" : "nan") : (upper ? "INF" : "inf");
    while (*s != '\0')
      *p++ = *s++;
    padding = ' ';
  } else if (conv == 'e' || conv == 'E') {
    p = put_scientific(p, x, prec < 0 ? 6 : prec, alt, upper, NULL);
  } else if (conv == 'g' || conv == 'G') {
    int P = prec < 0 ? 6 : prec == 0 ? 1 : prec;
    int e = 0;
    char probe[400];
    if (x != 0)
      put_scientific(probe, x, P - 1, false, upper, &e);
    if (e < -4 || e >= P || x >= 1e18) {   // put_fixed needs x < 1e18
      p = put_scientific(p, x, P - 1, alt, upper, NULL);
      if (!alt) {
        // Strip zeros from the mantissa only.
        char *ech = p;
        while (ech > digits && *ech != 'e' && *ech != 'E')
          --ech;
        char tail[8];
        int tn = (int)(p - ech);
        for (int i = 0; i < tn; ++i)
          tail[i] = ech[i];
        p = strip_zeros(digits, ech);
        for (int i = 0; i < tn; ++i)
          *p++ = tail[i];
      }
    } else {
      p = put_fixed(p, x, P - 1 - e, alt);
      if (!alt)
        p = strip_zeros(digits, p);
    }
  } else if (x >= 1e18) {
    p = put_scientific(p, x, prec < 0 ? 6 : prec, alt, upper, NULL);   // too big for the fixed path
  } else {
    p = put_fixed(p, x, prec < 0 ? 6 : prec, alt);
  }

  int len = (int)(p - body);
  int pad = width > len ? width - len : 0;
  if (leftalign) {
    putnstr(fp, len, body);
    putpadding(fp, pad, ' ');
  } else if (padding == '0') {
    putnstr(fp, (int)(digits - body), body);   // the sign goes before the zeros
    putpadding(fp, pad, '0');
    putnstr(fp, (int)(p - digits), digits);
  } else {
    putpadding(fp, pad, ' ');
    putnstr(fp, len, body);
  }
  return len + pad;
}
#endif

// An integer with its sign (0, '-', '+' or ' '), its prefix ("0", "0x", "0X" or ""), at least `prec` digits (-1, as
// they come) and padded to `width`.
static int put_integer(FILE *fp, unsigned long long x, int base, const char *digits, char sign, const char *prefix,
                       int width, int prec, bool leftalign, bool zero) {
  char buf[32];
  STATIC_ASSERT(sizeof(buf) >= (sizeof(long long) * CHAR_BIT + 2) / 3);
  int n = 0;
  if (x != 0 || prec != 0) {
    do {
      buf[sizeof(buf) - (++n)] = digits[x % base];
      x /= base;
    } while (x != 0);
  }
  // The # of %o only adds a 0 if the number doesn't start with one.
  if (prefix[0] == '0' && prefix[1] == '\0' && (prec > n || (n > 0 && buf[sizeof(buf) - n] == '0')))
    prefix = "";
  int zeros = prec > n ? prec - n : 0;
  int len = (sign != 0) + (int)strlen(prefix) + zeros + n;
  int pad = width > len ? width - len : 0;
  if (zero && !leftalign && prec < 0) {
    zeros += pad;
    pad = 0;
  }
  if (!leftalign)
    putpadding(fp, pad, ' ');
  if (sign != 0)
    _fputc(sign, fp);
  putnstr(fp, (int)strlen(prefix), prefix);
  putpadding(fp, zeros, '0');
  fwrite(&buf[sizeof(buf) - n], 1, n, fp);
  if (leftalign)
    putpadding(fp, pad, ' ');
  return (sign != 0) + (int)strlen(prefix) + zeros + n + pad;
}

static int put_text(FILE *fp, const char *s, int len, int width, bool leftalign) {
  int pad = width > len ? width - len : 0;
  if (!leftalign)
    putpadding(fp, pad, ' ');
  fwrite(s, 1, len, fp);
  if (leftalign)
    putpadding(fp, pad, ' ');
  return len + pad;
}

enum { L_INT, L_CHAR, L_SHORT, L_LONG, L_LLONG, L_SIZE, L_MAX, L_PTRDIFF, L_LDOUBLE };

int vfprintf(FILE *fp, const char *fmt_, va_list ap) {
  const unsigned char *fmt = (const unsigned char*)fmt_;
  int o = 0;

  for (int i = 0; fmt[i] != '\0'; i++) {
    int c = fmt[i];
    if (c != '%') {
      _fputc(c, fp);
      ++o;
      continue;
    }

    bool leftalign = false, alt = false, zero = false;
    char sign = 0;
    for (;;) {
      c = fmt[++i];
      if (c == '-') leftalign = true;
      else if (c == '+') sign = '+';
      else if (c == ' ') { if (sign == 0) sign = ' '; }
      else if (c == '#') alt = true;
      else if (c == '0') zero = true;
      else break;
    }
    int width = 0;
    if (c == '*') {
      width = va_arg(ap, int);
      if (width < 0) {
        leftalign = true;
        width = -width;
      }
      c = fmt[++i];
    } else {
      while (c >= '0' && c <= '9') {
        width = width * 10 + (c - '0');
        c = fmt[++i];
      }
    }
    int prec = -1;
    if (c == '.') {
      prec = 0;
      c = fmt[++i];
      if (c == '*') {
        prec = va_arg(ap, int);
        if (prec < 0)
          prec = -1;
        c = fmt[++i];
      } else {
        while (c >= '0' && c <= '9') {
          prec = prec * 10 + (c - '0');
          c = fmt[++i];
        }
      }
    }
    int size = L_INT;
    if (c == 'h') {
      size = L_SHORT;
      c = fmt[++i];
      if (c == 'h') {
        size = L_CHAR;
        c = fmt[++i];
      }
    } else if (c == 'l') {
      size = L_LONG;
      c = fmt[++i];
      if (c == 'l') {
        size = L_LLONG;
        c = fmt[++i];
      }
    } else if (c == 'L' || c == 'q') {
      size = c == 'L' ? L_LDOUBLE : L_LLONG;
      c = fmt[++i];
    } else if (c == 'z' || c == 'j' || c == 't') {
      size = c == 'z' ? L_SIZE : c == 'j' ? L_MAX : L_PTRDIFF;
      c = fmt[++i];
    }

    switch (c) {
    case 'd': case 'i':
      {
        long long x;
        switch (size) {
        case L_CHAR:  x = (signed char)va_arg(ap, int); break;
        case L_SHORT: x = (short)va_arg(ap, int); break;
        case L_LONG:  x = va_arg(ap, long); break;
        case L_LLONG: case L_MAX: case L_LDOUBLE: x = va_arg(ap, long long); break;
        case L_SIZE:  x = va_arg(ap, ssize_t); break;
        case L_PTRDIFF: x = va_arg(ap, ptrdiff_t); break;
        default:      x = va_arg(ap, int); break;
        }
        bool negative = x < 0;
        unsigned long long ux = negative ? -(unsigned long long)x : (unsigned long long)x;
        o += put_integer(fp, ux, 10, kHexDigits, negative ? '-' : sign, "", width, prec, leftalign, zero);
      }
      break;
    case 'u': case 'o': case 'x': case 'X':
      {
        unsigned long long x;
        switch (size) {
        case L_CHAR:  x = (unsigned char)va_arg(ap, unsigned int); break;
        case L_SHORT: x = (unsigned short)va_arg(ap, unsigned int); break;
        case L_LONG:  x = va_arg(ap, unsigned long); break;
        case L_LLONG: case L_MAX: case L_LDOUBLE: x = va_arg(ap, unsigned long long); break;
        case L_SIZE:  x = va_arg(ap, size_t); break;
        case L_PTRDIFF: x = (unsigned long)va_arg(ap, ptrdiff_t); break;
        default:      x = va_arg(ap, unsigned int); break;
        }
        int base = c == 'o' ? 8 : c == 'u' ? 10 : 16;
        const char *prefix = !alt || c == 'u' ? "" : c == 'o' ? "0" : x == 0 ? "" : c == 'X' ? "0X" : "0x";
        o += put_integer(fp, x, base, c == 'X' ? kUpperHexDigits : kHexDigits, 0, prefix, width, prec, leftalign, zero);
      }
      break;
    case 'p':
      {
        void *ptr = va_arg(ap, void*);
        o += put_integer(fp, (uintptr_t)ptr, 16, kHexDigits, 0, "0x", width, prec, leftalign, false);
      }
      break;
    case 's':
      {
        const char *s = va_arg(ap, const char*);
        if (s == NULL)
          s = prec < 0 || prec >= 6 ? "(null)" : "";
        int len = 0;
        while ((prec < 0 || len < prec) && s[len] != '\0')
          ++len;
        o += put_text(fp, s, len, width, leftalign);
      }
      break;
    case 'c':
      {
        char ch = (char)va_arg(ap, int);
        o += put_text(fp, &ch, 1, width, leftalign);
      }
      break;
    case 'n':
      {
        void *p = va_arg(ap, void*);
        switch (size) {
        case L_CHAR:  *(signed char*)p = o; break;
        case L_SHORT: *(short*)p = o; break;
        case L_LONG:  *(long*)p = o; break;
        case L_LLONG: case L_MAX: *(long long*)p = o; break;
        case L_SIZE:  *(ssize_t*)p = o; break;
        case L_PTRDIFF: *(ptrdiff_t*)p = o; break;
        default:      *(int*)p = o; break;
        }
      }
      break;
    case '%':
      _fputc(c, fp);
      ++o;
      break;
#ifndef __NO_FLONUM
    case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': case 'a': case 'A':
      {
        long double x = size == L_LDOUBLE ? va_arg(ap, long double) : va_arg(ap, double);
        // Hexadecimal floats aren't written here: they go as %e.
        int conv = c == 'a' ? 'e' : c == 'A' ? 'E' : c;
        o += printflonum(fp, x, conv, width, prec, sign, leftalign, zero ? '0' : ' ', alt);
      }
      break;
#endif
    default:
      // Unknown % sequence.  Print it to draw attention.
      _fputc('%', fp);
      ++o;
      if (c != '\0') {
        _fputc(c, fp);
        ++o;
      } else {
        --i;
      }
      break;
    }
  }

  return o;
}

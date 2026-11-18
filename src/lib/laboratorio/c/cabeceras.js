// What the headers of xcc don't have and a student uses: written in apoyo.c, declared here, at the end of each header.
export const AGREGADOS = {
  '/usr/include/stdio.h': `
typedef long fpos_t;
#define BUFSIZ        1024
#define FILENAME_MAX  512
#define _IOFBF  0
#define _IOLBF  1
#define _IONBF  2
void clearerr(FILE *fp);
int ferror(FILE *fp);
void rewind(FILE *fp);
int fgetpos(FILE *fp, fpos_t *pos);
int fsetpos(FILE *fp, const fpos_t *pos);
int setvbuf(FILE *fp, char *buf, int modo, size_t tam);
void setbuf(FILE *fp, char *buf);
char *gets(char *s);
int vscanf(const char *restrict format, va_list ap);
`,
  '/usr/include/stdlib.h': `
#if defined(__wasm)
_Noreturn void abort(void);
#endif
typedef struct { int quot, rem; } div_t;
typedef struct { long quot, rem; } ldiv_t;
typedef struct { long long quot, rem; } lldiv_t;
div_t div(int a, int b);
ldiv_t ldiv(long a, long b);
lldiv_t lldiv(long long a, long long b);
float strtof(const char *restrict p, char **restrict pp);
int system(const char *orden);
`,
  '/usr/include/string.h': `
#include <strings.h>
size_t strxfrm(char *restrict dst, const char *restrict src, size_t n);
`,
  '/usr/include/ctype.h': '\nint isblank(int c);\n',
  '/usr/include/math.h': `
#ifndef __NO_FLONUM
double trunc(double x);
double rint(double x);
double nearbyint(double x);
long lrint(double x);
long long llrint(double x);
long lround(double x);
long long llround(double x);
double hypot(double x, double y);
double cbrt(double x);
double exp2(double x);
double expm1(double x);
double log1p(double x);
double fmin(double a, double b);
double fmax(double a, double b);
double fdim(double a, double b);
double fma(double a, double b, double c);
double remainder(double x, double y);
float sqrtf(float x);
float powf(float x, float y);
float sinf(float x);
float cosf(float x);
float tanf(float x);
float asinf(float x);
float acosf(float x);
float atanf(float x);
float atan2f(float y, float x);
float expf(float x);
float logf(float x);
float log10f(float x);
float log2f(float x);
float floorf(float x);
float ceilf(float x);
float roundf(float x);
float truncf(float x);
float fmodf(float x, float y);
float hypotf(float x, float y);
float cbrtf(float x);
float fminf(float a, float b);
float fmaxf(float a, float b);
#endif
`,
  '/usr/include/time.h': `
#include <stddef.h>
typedef long clock_t;
#define CLOCKS_PER_SEC 1000000L
clock_t clock(void);
struct tm {
  int tm_sec;
  int tm_min;
  int tm_hour;
  int tm_mday;
  int tm_mon;
  int tm_year;
  int tm_wday;
  int tm_yday;
  int tm_isdst;
};
double difftime(time_t fin, time_t inicio);
struct tm *gmtime(const time_t *t);
struct tm *localtime(const time_t *t);
struct tm *gmtime_r(const time_t *t, struct tm *r);
struct tm *localtime_r(const time_t *t, struct tm *r);
time_t mktime(struct tm *f);
size_t strftime(char *restrict s, size_t max, const char *restrict formato, const struct tm *restrict f);
char *asctime(const struct tm *f);
char *ctime(const time_t *t);
`,
};

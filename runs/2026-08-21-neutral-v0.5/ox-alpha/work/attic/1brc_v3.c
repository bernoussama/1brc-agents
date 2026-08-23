// 1BRC Round A - parallel mmap + AVX2 scanner, SoA tables, branchless temp parse
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <pthread.h>
#include <sys/mman.h>
#include <sys/stat.h>

#if defined(__x86_64__)
#include <immintrin.h>
#define HAVE_AVX2 1
#endif

#ifndef NSLOTS
#define NSLOTS 1024
#endif
#define SLOTMASK (NSLOTS - 1)

typedef struct {
    uint64_t key[NSLOTS];        // 0 = empty; hash of name
    const char *name[NSLOTS];
    uint32_t len[NSLOTS];
    int16_t mn[NSLOTS];
    int16_t mx[NSLOTS];
    int64_t sum[NSLOTS];
    int32_t cnt[NSLOTS];
} Table;

static inline int name_eq(const char *a, const char *b, uint32_t len) {
    uint32_t i = 0;
    uint64_t x, y;
    for (; i + 8 <= len; i += 8) {
        memcpy(&x, a + i, 8);
        memcpy(&y, b + i, 8);
        if (x != y) return 0;
    }
    if (i < len) {
        x = y = 0;
        memcpy(&x, a + i, len - i);
        memcpy(&y, b + i, len - i);
        if (x != y) return 0;
    }
    return 1;
}

static inline uint32_t table_probe(Table *t, const char *name, uint32_t len,
                                   uint64_t h, int *ins) {
    uint32_t idx = (uint32_t)h & SLOTMASK;
    *ins = 0;
    for (;;) {
        uint64_t k = t->key[idx];
        if (k == h) {
            if (t->len[idx] == len && name_eq(t->name[idx], name, len))
                return idx;
        } else if (k == 0) {
            *ins = 1;
            return idx;
        }
        idx = (idx + 1) & SLOTMASK;
    }
}

#ifdef HAVE_AVX2
static inline uint32_t scan_mask(const char *q, const __m256i needle) {
    __m256i v = _mm256_loadu_si256((const __m256i *)q);
    return (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v, needle));
}
#endif

typedef struct {
    const char *start;
    const char *end;
    Table tbl;
} Job;

static void *worker(void *arg) {
    Job *j = (Job *)arg;
    Table *t = &j->tbl;
    memset(t, 0, sizeof(*t));
    const char *p = j->start;
    const char *end = j->end;

#ifdef HAVE_AVX2
    const __m256i needle = _mm256_set1_epi8(';');
    while (p < end) {
        const char *q = p;
        uint32_t mask;
        for (;;) {
            mask = scan_mask(q, needle);
            if (__builtin_expect(mask != 0, 1)) break;
            q += 32;
        }
        uint32_t d = (uint32_t)__builtin_ctz(mask);
        const char *semi = q + d;
        uint32_t len = d + (uint32_t)(q - p);

        uint64_t w = 0;
        if (len >= 8) memcpy(&w, p, 8);
        else memcpy(&w, p, len);
        uint64_t h = (w * 0x9E3779B97F4A7C15ULL) ^ ((uint64_t)len * 0xC2B2AE3D27D4EB4FULL);
        if (!h) h = 1;

        // branchless temperature parse: [-]D.D or [-]DD.D
        uint64_t tw;
        memcpy(&tw, semi + 1, 8); // guard region follows mapping; extra bytes ignored
        int n = -(int)((tw & 0xff) == '-');           // 0 or -1
        uint64_t ts = tw >> (n & 8);                  // skip '-' if present
        int c0 = (int)(ts & 0xff) - '0';
        int c1 = (int)((ts >> 8) & 0xff) - '0';
        int c2 = (int)((ts >> 16) & 0xff) - '0';
        int c3 = (int)((ts >> 24) & 0xff) - '0';
        int a1 = (c1 == '.' - '0');                   // one integer digit
        int intpart = a1 ? c0 : c0 * 10 + c1;
        int frac = a1 ? c2 : c3;
        int tv = intpart * 10 + frac;
        tv = n ? -tv : tv;

        int ins;
        uint32_t i = table_probe(t, p, len, h, &ins);
        if (ins) {
            t->key[i] = h;
            t->name[i] = p;
            t->len[i] = len;
            t->mn[i] = (int16_t)tv;
            t->mx[i] = (int16_t)tv;
            t->sum[i] = tv;
            t->cnt[i] = 1;
        } else {
            if (tv < t->mn[i]) t->mn[i] = (int16_t)tv;
            if (tv > t->mx[i]) t->mx[i] = (int16_t)tv;
            t->sum[i] += tv;
            t->cnt[i]++;
        }
        // next line starts at: semi + 1(sign) + ndigits + 3('.' frac '\n')
        p = semi + 4 + (a1 ? 1 : 2) - n;
    }
#else
    while (p < end) {
        const char *semi = p;
        while (*semi != ';') semi++;
        uint32_t len = (uint32_t)(semi - p);
        uint64_t w = 0;
        if (len >= 8) memcpy(&w, p, 8); else memcpy(&w, p, len);
        uint64_t h = (w * 0x9E3779B97F4A7C15ULL) ^ ((uint64_t)len * 0xC2B2AE3D27D4EB4FULL);
        if (!h) h = 1;
        const char *r = semi + 1;
        int neg = (*r == '-');
        const char *r2 = r + neg;
        int a1 = (r2[1] == '.');
        int intpart = (r2[0] - '0') * 10 + (a1 ? 0 : (r2[1] - '0'));
        int frac = a1 ? (r2[2] - '0') : (r2[3] - '0');
        int tv = intpart * 10 + frac;
        if (neg) tv = -tv;
        int ins;
        uint32_t i = table_probe(t, p, len, h, &ins);
        if (ins) {
            t->key[i] = h; t->name[i] = p; t->len[i] = len;
            t->mn[i] = (int16_t)tv; t->mx[i] = (int16_t)tv;
            t->sum[i] = tv; t->cnt[i] = 1;
        } else {
            if (tv < t->mn[i]) t->mn[i] = (int16_t)tv;
            if (tv > t->mx[i]) t->mx[i] = (int16_t)tv;
            t->sum[i] += tv; t->cnt[i]++;
        }
        p = r2 + 3 + (a1 ? 1 : 2);
    }
#endif
    return NULL;
}

static Table merged;

static int cmp_idx(const void *a, const void *b) {
    uint32_t x = *(const uint32_t *)a, y = *(const uint32_t *)b;
    const char *nx = merged.name[x], *ny = merged.name[y];
    uint32_t lx = merged.len[x], ly = merged.len[y];
    uint32_t nn = lx < ly ? lx : ly;
    int c = memcmp(nx, ny, nn);
    if (c) return c;
    return (int)lx - (int)ly;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file> [threads]\n", argv[0]); return 1; }
    const char *path = argv[1];

    int fd = open(path, O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st)) { perror("fstat"); return 1; }
    size_t size = (size_t)st.st_size;

    long psz_l = sysconf(_SC_PAGESIZE);
    size_t psz = psz_l > 0 ? (size_t)psz_l : 4096;
    size_t flen = (size + psz - 1) & ~(psz - 1);
    if (flen == 0) flen = psz;

    char *data = mmap(NULL, flen + psz, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (data == MAP_FAILED) { perror("mmap reserve"); return 1; }
    if (size) {
        void *r = mmap(data, flen, PROT_READ, MAP_PRIVATE | MAP_FIXED | MAP_POPULATE, fd, 0);
        if (r == MAP_FAILED) { perror("mmap file"); return 1; }
        madvise(data, flen, MADV_HUGEPAGE);
    }
    void *g = mmap(data + flen, psz, PROT_READ | PROT_WRITE,
                   MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);
    if (g == MAP_FAILED) { perror("mmap guard"); return 1; }

    int nthreads = 6;
    FILE *fq = fopen("/sys/fs/cgroup/cpu.max", "r");
    if (fq) {
        char buf[128];
        if (fgets(buf, sizeof(buf), fq)) {
            long q, per;
            if (sscanf(buf, "%ld %ld", &q, &per) == 2 && q > 0 && per > 0) {
                int nt = (int)((q + per - 1) / per);
                if (nt >= 1 && nt <= 64) nthreads = nt;
            } else if (strncmp(buf, "max", 3) == 0) {
                long na = sysconf(_SC_NPROCESSORS_ONLN);
                if (na > 0 && na <= 64) nthreads = (int)na;
            }
        }
        fclose(fq);
    }

    if ((size_t)nthreads * 4096 > size) nthreads = size ? (int)(size >> 12) : 1;
    if (nthreads < 1) nthreads = 1;

    pthread_t th[64];
    static Job jobs[64];
    memset(jobs, 0, sizeof(jobs));
    size_t chunk = size / (size_t)nthreads;
    for (int i = 0; i < nthreads; i++) {
        const char *s = data + chunk * (size_t)i;
        const char *e = data + (i == nthreads - 1 ? size : chunk * (size_t)(i + 1));
        if (i > 0) { while (*s != '\n') s++; s++; }
        if (i < nthreads - 1) { while (*e != '\n') e++; e++; }
        jobs[i].start = s;
        jobs[i].end = e;
    }
    for (int i = 1; i < nthreads; i++)
        pthread_create(&th[i], NULL, worker, &jobs[i]);
    worker(&jobs[0]);
    for (int i = 1; i < nthreads; i++)
        pthread_join(th[i], NULL);

    memset(&merged, 0, sizeof(merged));
    for (int tI = 0; tI < nthreads; tI++) {
        Table *t = &jobs[tI].tbl;
        for (uint32_t s = 0; s < NSLOTS; s++) {
            if (!t->key[s]) continue;
            int ins;
            uint32_t i = table_probe(&merged, t->name[s], t->len[s], t->key[s], &ins);
            if (ins) {
                merged.key[i] = t->key[s];
                merged.name[i] = t->name[s];
                merged.len[i] = t->len[s];
                merged.mn[i] = t->mn[s];
                merged.mx[i] = t->mx[s];
                merged.sum[i] = t->sum[s];
                merged.cnt[i] = t->cnt[s];
            } else {
                if (t->mn[s] < merged.mn[i]) merged.mn[i] = t->mn[s];
                if (t->mx[s] > merged.mx[i]) merged.mx[i] = t->mx[s];
                merged.sum[i] += t->sum[s];
                merged.cnt[i] += t->cnt[s];
            }
        }
    }

    static uint32_t idxs[NSLOTS];
    uint32_t k = 0;
    for (uint32_t s = 0; s < NSLOTS; s++)
        if (merged.key[s]) idxs[k++] = s;
    qsort(idxs, k, sizeof(uint32_t), cmp_idx);

    size_t cap = 64 * 1024;
    char *out = malloc(cap);
    size_t o = 0;
    out[o++] = '{';
    for (uint32_t i = 0; i < k; i++) {
        uint32_t ix = idxs[i];
        if (i) { out[o++] = ','; out[o++] = ' '; }
        uint32_t len = merged.len[ix];
        memcpy(out + o, merged.name[ix], len);
        o += len;
        out[o++] = '=';

        int64_t num = merged.sum[ix];
        int64_t cnt = merged.cnt[ix];
        int negmean = num < 0;
        uint64_t un = negmean ? -(uint64_t)num : (uint64_t)num;
        uint64_t rr = (un + (uint64_t)(cnt / 2)) / (uint64_t)cnt;
        int32_t mean = negmean ? -(int32_t)rr : (int32_t)rr;

        int32_t vals[3];
        vals[0] = merged.mn[ix]; vals[1] = mean; vals[2] = merged.mx[ix];
        for (int vi = 0; vi < 3; vi++) {
            if (vi) out[o++] = '/';
            int32_t v = vals[vi];
            uint32_t uv = v < 0 ? (uint32_t)(-(int64_t)v) : (uint32_t)v;
            if (v < 0) out[o++] = '-';
            if (uv >= 100) {
                out[o++] = (char)('0' + uv / 100);
                out[o++] = (char)('0' + (uv / 10) % 10);
            } else {
                out[o++] = (char)('0' + uv / 10);
            }
            out[o++] = '.';
            out[o++] = (char)('0' + uv % 10);
        }
    }
    out[o++] = '}';
    fwrite(out, 1, o, stdout);
    fputc('\n', stdout);
    return 0;
}

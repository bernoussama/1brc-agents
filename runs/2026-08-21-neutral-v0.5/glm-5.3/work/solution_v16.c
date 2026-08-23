// Fast 1BRC solver: mmap + 6 threads + AVX2 scan + (a,len)-keyed direct open addressing.
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <fcntl.h>
#include <unistd.h>
#include <math.h>
#include <pthread.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <immintrin.h>

#define NTHREADS 6
#define NBUCKETS 8192          /* power of 2 */
#define MAXENTS 900
#define EEMPTY 0xFFFF

typedef struct {
    uint64_t a;       /* first min(len,8) name bytes, zero-masked */
    uint64_t w1;      /* name bytes 8..15 (masked to len if len<16; 0 if len<=8) */
    int64_t sum;      /* sum of tenths */
    int64_t count;
    int16_t min, max;
    uint16_t len;
    uint8_t pad[26];
} Ent;

typedef struct {
    Ent slots[NBUCKETS];
    const uint8_t *names[NBUCKETS];   /* first-occurrence pointer per slot */
    int nents;
    int strict;       /* 1 if (a,len) is not a unique key: verify full name */
} Table;

static uint64_t m1tab[256];
static void init_masks(void) {
    for (int s = 0; s < 256; s++) {
        uint64_t m1;
        if (s >= 16) m1 = ~0ULL; else if (s > 8) m1 = (1ULL << (8 * (s - 8))) - 1; else m1 = 0;
        m1tab[s] = m1;
    }
}
static inline uint64_t load64(const uint8_t *p) {
    uint64_t v; memcpy(&v, p, 8); return v;
}

static void *worker(void *arg);

typedef struct {
    Table *t;
    const uint8_t *start, *end;
    int tidx;
} Job;

static inline int lexcmp(const uint8_t *a, size_t la, const uint8_t *b, size_t lb) {
    size_t m = la < lb ? la : lb;
    int c = memcmp(a, b, m);
    if (c) return c;
    return (la < lb) ? -1 : (la > lb ? 1 : 0);
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s <file>\n", argv[0]); return 1; }
    init_masks();
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct stat st;
    if (fstat(fd, &st) < 0) { perror("fstat"); return 1; }
    size_t size = (size_t)st.st_size;

    if (size == 0) {
        const char *e = "{}\n";
        fwrite(e, 1, 3, stdout);
        return 0;
    }

    size_t guard = 1 << 20;
    uint8_t *base = mmap(NULL, size + guard, PROT_READ, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base == MAP_FAILED) { perror("mmap anon"); return 1; }
    uint8_t *fm = mmap(base, size, PROT_READ, MAP_PRIVATE | MAP_FIXED, fd, 0);
    if (fm != base) { perror("mmap file"); return 1; }
    close(fd);

    const uint8_t *starts[NTHREADS + 1];
    starts[0] = base;
    starts[NTHREADS] = base + size;
    size_t per = size / NTHREADS + 1;
    for (int i = 1; i < NTHREADS; i++) {
        const uint8_t *q = base + (size_t)i * per;
        if (q >= base + size) q = base + size - 1;
        const uint8_t *r = memchr(q, '\n', (size_t)(base + size - q));
        starts[i] = r ? r + 1 : base + size;
    }
    for (int i = 1; i < NTHREADS; i++)
        if (starts[i] < starts[i-1]) starts[i] = starts[i-1];

    static Table tables[NTHREADS];
    for (int i = 0; i < NTHREADS; i++)
        for (int j = 0; j < NBUCKETS; j++) tables[i].slots[j].len = EEMPTY;

    pthread_t th[NTHREADS];
    Job jobs[NTHREADS];
    for (int i = 0; i < NTHREADS; i++) {
        jobs[i].t = &tables[i];
        jobs[i].start = starts[i];
        jobs[i].end = starts[i + 1];
        jobs[i].tidx = i;
        if (i == 0) continue;
        if (pthread_create(&th[i], NULL, worker, &jobs[i]) != 0) {
            fprintf(stderr, "pthread_create failed\n"); return 1;
        }
    }
    worker(&jobs[0]);
    for (int i = 1; i < NTHREADS; i++) pthread_join(th[i], NULL);

    /* merge into global table */
    static Table g;
    for (int j = 0; j < NBUCKETS; j++) g.slots[j].len = EEMPTY;
    for (int ti = 0; ti < NTHREADS; ti++) {
        Table *t = &tables[ti];
        for (int b = 0; b < NBUCKETS; b++) {
            if (t->slots[b].len == EEMPTY) continue;
            Ent *E = &t->slots[b];
            const uint8_t *nm = t->names[b];
            int found = -1;
            for (int k = 0; k < NBUCKETS; k++) {
                if (g.slots[k].len == EEMPTY) continue;
                if (g.slots[k].len == E->len && memcmp(g.names[k], nm, E->len) == 0) { found = k; break; }
            }
            if (found < 0) {
                /* insert into global: probe for empty */
                int gb = 0;
                /* find truly-empty slot */
                int insert_at = -1;
                for (int k = 0; k < NBUCKETS; k++) if (g.slots[k].len == EEMPTY) { insert_at = k; break; }
                (void)gb;
                g.slots[insert_at] = *E;
                g.names[insert_at] = nm;
            } else {
                Ent *G = &g.slots[found];
                G->sum += E->sum; G->count += E->count;
                if (E->min < G->min) G->min = E->min;
                if (E->max > G->max) G->max = E->max;
            }
        }
    }

    int idx[NBUCKETS]; int n = 0;
    for (int k = 0; k < NBUCKETS; k++)
        if (g.slots[k].len != EEMPTY) idx[n++] = k;
    for (int i = 1; i < n; i++) {
        int key = idx[i];
        int j = i - 1;
        while (j >= 0 && lexcmp(g.names[idx[j]], g.slots[idx[j]].len, g.names[key], g.slots[key].len) > 0) {
            idx[j + 1] = idx[j]; j--;
        }
        idx[j + 1] = key;
    }

    char *out = malloc(1 << 20);
    size_t outn = 0;
    out[outn++] = '{';
    for (int i = 0; i < n; i++) {
        Ent *E = &g.slots[idx[i]];
        const uint8_t *nm = g.names[idx[i]];
        if (i) { out[outn++] = ','; out[outn++] = ' '; }
        memcpy(out + outn, nm, E->len); outn += E->len;
        out[outn++] = '=';
        outn += sprintf(out + outn, "%.1f", (double)E->min / 10.0);
        out[outn++] = '/';
        double x = (double)E->sum / (double)E->count / 10.0;
        double scaled = x * 10.0;
        double r = (scaled >= 0.0) ? floor(scaled + 0.5) : ceil(scaled - 0.5);
        double v = r / 10.0;
        char buf[32];
        int L = sprintf(buf, "%.1f", v);
        if (L == 4 && buf[0] == '-' && buf[1] == '0' && buf[2] == '.' && buf[3] == '0') {
            L = 3; buf[0] = '0'; buf[1] = '.'; buf[2] = '0';
        }
        memcpy(out + outn, buf, L); outn += L;
        out[outn++] = '/';
        outn += sprintf(out + outn, "%.1f", (double)E->max / 10.0);
    }
    out[outn++] = '}';
    out[outn++] = '\n';
    fwrite(out, 1, outn, stdout);
    return 0;
}

static void *worker(void *arg) {
    Job *J = (Job *)arg;
    Table *t = J->t;
    const uint8_t *p = J->start;
    const uint8_t *end = J->end;
    madvise((void *)J->start, (size_t)(J->end - J->start), MADV_WILLNEED);

    const __m256i vsemi = _mm256_set1_epi8(';');
    const __m256i vnl = _mm256_set1_epi8('\n');
    uint64_t sm = 0, nm = 0;   /* 64-bit masks for bytes [p, p+64) */

    while (p < end) {
        uint32_t nl0, s;
        const uint8_t *lp;
        if (nm == 0) {
            __m256i v1 = _mm256_loadu_si256((const __m256i *)p);
            __m256i v2 = _mm256_loadu_si256((const __m256i *)(p + 32));
            sm = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v1, vsemi))
               | ((uint64_t)(uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v2, vsemi)) << 32);
            nm = (uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v1, vnl))
               | ((uint64_t)(uint32_t)_mm256_movemask_epi8(_mm256_cmpeq_epi8(v2, vnl)) << 32);
            __builtin_prefetch(p + 192, 0, 3);
            __builtin_prefetch(p + 256, 0, 3);
            if (__builtin_expect(nm == 0, 0)) {
                /* rare very long line: scalar scan (bounded) */
                lp = p;
                const uint8_t *r = p;
                const uint8_t *lim = p + 4096;
                if (lim > end) lim = end;
                while (r < lim && *r != ';') r++;
                s = (uint32_t)(r - p);
                while (r < lim && *r != '\n') r++;
                nl0 = (uint32_t)(r - p);
                p = (r < lim) ? r + 1 : end;
                nm = 0;
                goto have_line;
            }
        }
        nl0 = (uint32_t)__builtin_ctzll(nm);
        {
            s = (uint32_t)__builtin_ctzll(sm | nm);   /* ';' or '\n', whichever first */
            uint32_t sh = nl0 + 1;
            lp = p;
            p += sh;
            sm = sh < 64 ? sm >> sh : 0;
            nm = sh < 64 ? nm >> sh : 0;
            if (s == nl0) continue;   /* empty or malformed line: no ';' before '\n' */
        }
have_line:;

        /* ---- key early (hide slot-load latency behind temp parse) ---- */
        uint64_t a = _bzhi_u64(load64(lp), (uint64_t)s * 8);
        uint64_t w1 = load64(lp + 8) & m1tab[s];
        uint32_t bkt = (uint32_t)((a * 0x9E3779B97F4A7C15ULL) >> 51);
        Ent *E = &t->slots[bkt];

        /* ---- temperature (end-based, branchless) ---- */
        const uint8_t *q0 = lp + s + 1;
        uint32_t neg = (*q0 == '-');
        uint64_t we = load64(lp + nl0 - 7);
        uint32_t t32 = (uint32_t)(we >> 32);
        uint32_t f  = (t32 >> 16) & 0xF;
        uint32_t i1 = t32 & 0xF;
        uint32_t c3 = (uint32_t)(we >> 24) & 0xFF;
        uint32_t twod = (uint32_t)(c3 - 0x30) < 10u;
        uint32_t i2 = c3 & 0xF;
        int32_t ip = (int32_t)(i1 + twod * (10u * i2));
        int32_t t10 = ip * 10 + (int32_t)f;
        t10 = (t10 ^ -(int32_t)neg) + (int32_t)neg;
        while (__builtin_expect(E->len != EEMPTY, 1)) {
            if (__builtin_expect(E->a == a && E->w1 == w1, 1)
                && (__builtin_expect(s < 16, 1)
                    || (E->len == (uint16_t)s
                        && (s == 16 || memcmp(lp + 16, t->names[bkt] + 16, s - 16) == 0)))) {
                _mm_storeu_si128((__m128i *)&E->sum,
                    _mm_add_epi64(_mm_loadu_si128((const __m128i *)&E->sum),
                                  _mm_set_epi64x(1, (int64_t)t10)));
                if (t10 < E->min) E->min = (int16_t)t10;
                if (t10 > E->max) E->max = (int16_t)t10;
                goto next;
            }
            bkt = (bkt + 1) & (NBUCKETS - 1);
            E = &t->slots[bkt];
        }
        if (__builtin_expect(t->nents < MAXENTS, 1)) {
            E->a = a; E->w1 = w1;
            E->sum = t10; E->count = 1; E->min = (int16_t)t10; E->max = (int16_t)t10;
            E->len = (uint16_t)s;
            t->names[bkt] = lp;
            t->nents++;
        }
next:;
    }
    return NULL;
}

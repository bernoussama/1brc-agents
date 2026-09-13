// Verifies that all distinct station names in the file have pairwise-distinct
// hash keys under the exact hash used by the main binary's fast path.
// Prints UNIQUE or COLLIDE. Safe: uses full string comparison internally.
// Parallel: same chunking scheme as the main binary.
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

#define NSLOTS 65536
#define SLOTMASK (NSLOTS - 1)
#define MAXNAMES 100000

static uint64_t hash_name(const char *s, uint32_t n) {
    uint64_t w = 0;
    uint32_t m = n < 8 ? n : 8;
    memcpy(&w, s, m);
    uint64_t h = (w * 0x9E3779B97F4A7C15ULL) ^ ((uint64_t)n * 0xC2B2AE3D27D4EB4FULL);
    return h ? h : 1;
}

typedef struct {
    uint64_t key[NSLOTS];
    const char *name[NSLOTS];
    uint32_t len[NSLOTS];
    uint32_t nents;
    const char *listp[MAXNAMES / 8 + 16];
    uint32_t listl[MAXNAMES / 8 + 16];
} Tbl;

typedef struct {
    const char *start, *end;
    Tbl *t;
    int overflow;
} Job;

static void *worker(void *arg) {
    Job *j = (Job *)arg;
    Tbl *t = j->t;
    memset(t, 0, sizeof(Tbl));
    const char *p = j->start, *end = j->end;
    while (p < end) {
        const char *semi = memchr(p, ';', end - p);
        if (!semi) break;
        uint32_t len = (uint32_t)(semi - p);
        uint64_t h = hash_name(p, len);
        uint32_t idx = (uint32_t)(h & SLOTMASK);
        for (;;) {
            if (!t->key[idx]) {
                if (t->nents >= MAXNAMES / 8 + 8) { j->overflow = 1; return NULL; }
                t->key[idx] = h;
                t->name[idx] = p;
                t->len[idx] = len;
                t->listp[t->nents] = p;
                t->listl[t->nents] = len;
                t->nents++;
                break;
            }
            if (t->key[idx] == h && t->len[idx] == len &&
                memcmp(t->name[idx], p, len) == 0)
                break;
            idx = (idx + 1) & SLOTMASK;
        }
        p = semi + 1;
        while (p < end && *p != '\n') p++;
        p++;
    }
    return NULL;
}

static Tbl merged_tbl;

int main(int argc, char **argv) {
    if (argc < 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 2; }
    struct stat st;
    fstat(fd, &st);
    size_t size = (size_t)st.st_size;
    if (size == 0) { printf("UNIQUE\n"); return 0; }
    long psz = sysconf(_SC_PAGESIZE);
    size_t flen = ((size + psz - 1) / psz) * psz;
    char *data = mmap(NULL, flen + psz, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (data == MAP_FAILED) return 2;
    void *r = mmap(data, flen, PROT_READ, MAP_PRIVATE | MAP_FIXED | MAP_POPULATE, fd, 0);
    if (r == MAP_FAILED) return 2;
    void *g = mmap(data + flen, psz, PROT_READ | PROT_WRITE,
                   MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0);
    if (g == MAP_FAILED) return 2;

    int nthreads = 6;
    FILE *fq = fopen("/sys/fs/cgroup/cpu.max", "r");
    if (fq) {
        char buf[128];
        if (fgets(buf, sizeof(buf), fq)) {
            long q, per;
            if (sscanf(buf, "%ld %ld", &q, &per) == 2 && q > 0 && per > 0) {
                int nt = (int)((q + per - 1) / per);
                if (nt >= 1 && nt <= 64) nthreads = nt;
            }
        }
        fclose(fq);
    }
    if ((size_t)nthreads * 8192 > size) nthreads = (int)(size >> 13);
    if (nthreads < 1) nthreads = 1;

    static Job jobs[64];
    static Tbl tables[64];
    memset(jobs, 0, sizeof(jobs));
    int nchunks = nthreads * 2;
    static const char *cs[200], *ce[200];
    size_t chunk = size / (size_t)nchunks;
    for (int c = 0; c < nchunks; c++) {
        const char *s = data + chunk * (size_t)c;
        const char *e = data + (c == nchunks - 1 ? size : chunk * (size_t)(c + 1));
        if (c > 0) { while (*s != '\n') s++; s++; }
        if (c < nchunks - 1) { while (*e != '\n') e++; e++; }
        cs[c] = s; ce[c] = e;
    }
    for (int i = 0; i < nthreads; i++) {
        jobs[i].start = cs[2 * i];
        jobs[i].end = ce[2 * i];
        jobs[i].t = &tables[i];
    }
    pthread_t th[64];
    for (int i = 1; i < nthreads; i++)
        pthread_create(&th[i], NULL, worker, &jobs[i]);
    worker(&jobs[0]);
    for (int i = 1; i < nthreads; i++)
        pthread_join(th[i], NULL);
    for (int i = 0; i < nthreads; i++)
        if (jobs[i].overflow) { printf("COLLIDE\n"); return 0; }

    // merge per-thread lists into one global verified table
    memset(&merged_tbl, 0, sizeof(merged_tbl));
    int nnames = 0;
    static const char *gp[MAXNAMES];
    static uint32_t gl[MAXNAMES];
    for (int tI = 0; tI < nthreads; tI++) {
        Tbl *t = &tables[tI];
        for (uint32_t e = 0; e < t->nents; e++) {
            const char *nm = t->listp[e];
            uint32_t len = t->listl[e];
            uint64_t h = hash_name(nm, len);
            uint32_t idx = (uint32_t)(h & SLOTMASK);
            int dup = 0;
            for (;;) {
                if (!merged_tbl.key[idx]) break;
                if (merged_tbl.key[idx] == h && merged_tbl.len[idx] == len &&
                    memcmp(merged_tbl.name[idx], nm, len) == 0) { dup = 1; break; }
                idx = (idx + 1) & SLOTMASK;
            }
            if (!dup) {
                merged_tbl.key[idx] = h;
                merged_tbl.name[idx] = nm;
                merged_tbl.len[idx] = len;
                if (nnames >= MAXNAMES) { printf("COLLIDE\n"); return 0; }
                gp[nnames] = nm;
                gl[nnames] = len;
                nnames++;
            }
        }
    }

    // pairwise key-uniqueness among distinct names
    static uint64_t ks[MAXNAMES];
    for (int i = 0; i < nnames; i++)
        ks[i] = hash_name(gp[i], gl[i]);
    for (int i = 0; i < nnames; i++)
        for (uint32_t j2 = i + 1; j2 < (uint32_t)nnames; j2++)
            if (ks[i] == ks[j2]) { printf("COLLIDE\n"); return 0; }
    printf("UNIQUE\n");
    return 0;
}

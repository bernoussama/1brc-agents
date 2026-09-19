#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#define THREADS 4
#define HSIZE 1024

typedef struct {
    uint64_t hash;
    int64_t sum;
    uint64_t count;
    int min, max;
    unsigned short len;
    char name[128];
} Entry;

typedef struct {
    const unsigned char *p, *end;
    Entry tab[HSIZE];
} Worker;

static inline uint64_t hash_step(uint64_t h, unsigned char c) {
    return (h ^ c) * UINT64_C(1099511628211);
}

static void *work(void *arg) {
    Worker *w = (Worker *)arg;
    const unsigned char *p = w->p, *end = w->end;
    Entry *tab = w->tab;
    while (p < end) {
        const unsigned char *name = p;
        uint64_t h = UINT64_C(1469598103934665603);
        while (*p != ';') h = hash_step(h, *p++);
        unsigned len = (unsigned)(p - name);
        ++p;
        int neg = (*p == '-');
        p += neg;
        int v = *p++ - '0';
        if (*p != '.') v = v * 10 + (*p++ - '0');
        ++p;
        v = v * 10 + (*p++ - '0');
        ++p;
        if (neg) v = -v;

        unsigned slot = (unsigned)h & (HSIZE - 1);
        while (tab[slot].count &&
               (tab[slot].hash != h || tab[slot].len != len ||
                memcmp(tab[slot].name, name, len)))
            slot = (slot + 1) & (HSIZE - 1);
        Entry *e = &tab[slot];
        if (!e->count) {
            e->hash = h;
            e->len = len;
            memcpy(e->name, name, len);
            e->name[len] = 0;
            e->sum = v; e->count = 1; e->min = v; e->max = v;
        } else {
            e->sum += v; e->count++;
            if (v < e->min) e->min = v;
            if (v > e->max) e->max = v;
        }
    }
    return NULL;
}

static int cmp_entry(const void *a, const void *b) {
    const Entry *const *x = a, *const *y = b;
    return strcmp((*x)->name, (*y)->name);
}

static void put_tenth(int v) {
    if (v < 0) { putchar('-'); v = -v; }
    printf("%d.%d", v / 10, v % 10);
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) return 2;
    struct stat st;
    if (fstat(fd, &st)) return 2;
    size_t n = (size_t)st.st_size;
    unsigned char *data = mmap(NULL, n, PROT_READ, MAP_PRIVATE, fd, 0);
    if (data == MAP_FAILED) return 2;
    madvise(data, n, MADV_SEQUENTIAL);

    const unsigned char *bounds[THREADS + 1];
    bounds[0] = data; bounds[THREADS] = data + n;
    for (int i = 1; i < THREADS; ++i) {
        const unsigned char *p = data + n * i / THREADS;
        while (p[-1] != '\n') ++p;
        bounds[i] = p;
    }
    Worker *ws = calloc(THREADS, sizeof(*ws));
    pthread_t th[THREADS];
    for (int i = 0; i < THREADS; ++i) {
        ws[i].p = bounds[i]; ws[i].end = bounds[i + 1];
        pthread_create(&th[i], NULL, work, &ws[i]);
    }
    for (int i = 0; i < THREADS; ++i) pthread_join(th[i], NULL);

    Entry merged[HSIZE] = {0};
    for (int t = 0; t < THREADS; ++t) for (int i = 0; i < HSIZE; ++i) {
        Entry *s = &ws[t].tab[i];
        if (!s->count) continue;
        unsigned k = (unsigned)s->hash & (HSIZE - 1);
        while (merged[k].count && strcmp(merged[k].name, s->name)) k = (k + 1) & (HSIZE - 1);
        Entry *d = &merged[k];
        if (!d->count) *d = *s;
        else {
            d->sum += s->sum; d->count += s->count;
            if (s->min < d->min) d->min = s->min;
            if (s->max > d->max) d->max = s->max;
        }
    }
    Entry *list[HSIZE]; int cnt = 0;
    for (int i = 0; i < HSIZE; ++i) if (merged[i].count) list[cnt++] = &merged[i];
    qsort(list, cnt, sizeof(*list), cmp_entry);
    putchar('{');
    for (int i = 0; i < cnt; ++i) {
        Entry *e = list[i];
        if (i) fputs(", ", stdout);
        fputs(e->name, stdout); putchar('='); put_tenth(e->min); putchar('/');
        int64_t q;
        if (e->sum >= 0) q = (e->sum * 2 + (int64_t)e->count) / ((int64_t)e->count * 2);
        else q = -(((-e->sum) * 2 + (int64_t)e->count) / ((int64_t)e->count * 2));
        put_tenth((int)q); putchar('/'); put_tenth(e->max);
    }
    putchar('}');
    return 0;
}

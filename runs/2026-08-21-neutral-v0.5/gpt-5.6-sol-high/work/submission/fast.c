#define _GNU_SOURCE
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <pthread.h>
#include <limits.h>

#define NTH 6
#define TSZ 1024

typedef struct {
    int64_t sum;
    const char *name;
    uint32_t count;
    uint32_t hash;
    int16_t min, max;
    uint8_t len;
} Entry;

typedef struct {
    const char *base;
    size_t start, end, size;
    Entry *tab;
} Arg;

static inline uint64_t load64(const void *p) { uint64_t x; memcpy(&x,p,8); return x; }
static inline uint64_t haszero(uint64_t x) { return (x - 0x0101010101010101ULL) & ~x & 0x8080808080808080ULL; }
static inline uint32_t mix32(uint64_t x) {
    x ^= x >> 33; x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33; return (uint32_t)x;
}

static void *worker(void *vp) {
    Arg *a=(Arg*)vp;
    const char *p=a->base+a->start, *stop=a->base+a->end;
    if (a->start) { while (p < a->base+a->size && p[-1] != '\n') ++p; }
    Entry *tab=a->tab;
    while (p < stop) {
        const char *name=p;
        uint64_t h=0x9e3779b97f4a7c15ULL;
        unsigned len=0;
        for (;;) {
            uint64_t w=load64(p+len);
            uint64_t z=haszero(w ^ 0x3b3b3b3b3b3b3b3bULL);
            if (z) {
                unsigned k=(unsigned)(__builtin_ctzll(z)>>3);
                uint64_t mask = k ? ((1ULL << (k*8))-1) : 0;
                h = (h ^ (w & mask)) * 0x9e3779b185ebca87ULL;
                len += k;
                break;
            }
            h = (h ^ w) * 0x9e3779b185ebca87ULL;
            len += 8;
        }
        uint32_t hv=mix32(h ^ len);
        p=name+len+1;
        int neg=(*p=='-'); p+=neg;
        int v;
        if (p[1]=='.') { v=(p[0]-'0')*10+(p[2]-'0'); p+=4; }
        else { v=(p[0]-'0')*100+(p[1]-'0')*10+(p[3]-'0'); p+=5; }
        if (neg) v=-v;
        Entry *e=&tab[hv & (TSZ-1)];
        while (e->count && (e->hash != hv || e->len != len || memcmp(e->name,name,len))) {
            e=&tab[((unsigned)(e-tab)+1)&(TSZ-1)];
        }
        if (!e->count) {
            e->sum=v; e->name=name; e->count=1; e->hash=hv; e->min=e->max=v; e->len=(uint8_t)len;
        } else {
            e->sum += v; e->count++;
            if (v<e->min) e->min=v;
            if (v>e->max) e->max=v;
        }
    }
    return NULL;
}

static int cmpent(const void *aa,const void *bb) {
    const Entry *a=aa,*b=bb;
    unsigned n=a->len < b->len ? a->len:b->len;
    int c=memcmp(a->name,b->name,n);
    return c ? c : (int)a->len-(int)b->len;
}
static void print10(int v) {
    if (v<0) { putchar('-'); v=-v; }
    printf("%d.%d",v/10,v%10);
}
int main(int argc,char **argv) {
    if(argc<2) return 2;
    int fd=open(argv[1],O_RDONLY); if(fd<0)return 2;
    struct stat st; if(fstat(fd,&st))return 2;
    size_t size=st.st_size;
    const char *base=mmap(NULL,size,PROT_READ,MAP_PRIVATE,fd,0); if(base==MAP_FAILED)return 2;
    static Entry tabs[NTH][TSZ] __attribute__((aligned(64)));
    pthread_t th[NTH]; Arg args[NTH];
    for(unsigned i=0;i<NTH;i++) {
        args[i]=(Arg){base,size*i/NTH,size*(i+1)/NTH,size,tabs[i]};
        pthread_create(&th[i],NULL,worker,&args[i]);
    }
    for(unsigned i=0;i<NTH;i++) pthread_join(th[i],NULL);
    Entry out[TSZ]; unsigned no=0;
    for(unsigned ti=0;ti<NTH;ti++) for(unsigned j=0;j<TSZ;j++) if(tabs[ti][j].count) {
        Entry *s=&tabs[ti][j],*d=NULL;
        for(unsigned k=0;k<no;k++) if(out[k].len==s->len && !memcmp(out[k].name,s->name,s->len)){d=&out[k];break;}
        if(!d) out[no++]=*s;
        else { d->sum+=s->sum; d->count+=s->count; if(s->min<d->min)d->min=s->min; if(s->max>d->max)d->max=s->max; }
    }
    qsort(out,no,sizeof(*out),cmpent);
    putchar('{');
    for(unsigned i=0;i<no;i++) {
        if(i) fputs(", ",stdout);
        fwrite(out[i].name,1,out[i].len,stdout); putchar('='); print10(out[i].min); putchar('/');
        int64_t s=out[i].sum, c=out[i].count;
        int mean=(int)((s>=0 ? s+c/2 : s-c/2)/c);
        print10(mean); putchar('/'); print10(out[i].max);
    }
    putchar('}');
    return 0;
}

#define _GNU_SOURCE
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <immintrin.h>

#define SLOTS 8192
#define THREADS 6
#define BUFSIZE (512*1024)
typedef struct { const char *name; int64_t sum; uint32_t count; int16_t min, max; uint8_t len; } Entry;
typedef struct { Entry slots[SLOTS]; off_t begin, end; } Worker;
static Worker *workers;
static const char *data;
static size_t file_size;
static const char *path;
static void *work(void *arg) {
    Worker *w=arg;
    int fd=open(path,O_RDONLY);
    char *buf=malloc(BUFSIZE+256);
    off_t off=w->begin;
    size_t left=0;
    while(off<w->end || left) {
        size_t ask=w->end-off; if(ask>BUFSIZE-left)ask=BUFSIZE-left;
        ssize_t got=ask?pread(fd,buf+left,ask,off):0;
        if(got<0)abort();
        off+=got;
        size_t total=left+got;
        char *limit=buf+total;
        if(off<w->end) while(limit>buf && limit[-1]!='\n')limit--;
        const char *p=buf, *end=limit;
        uint64_t semi_mask=0;
        while(p<end) {
        const char *name=p;
        if(!semi_mask) {
            __m512i vec=_mm512_loadu_si512((const void*)p);
            semi_mask=(uint64_t)_mm512_cmpeq_epi8_mask(vec,_mm512_set1_epi8(';'));
        }
        uint64_t first; memcpy(&first,p,8);
        unsigned len=__builtin_ctzll(semi_mask);
        p+=len;
        uint64_t h;
        if(len<8) first &= (1ULL << (len*8))-1;
        h=(first&0x00ffffffffffffffULL) | ((uint64_t)len<<56);
        p++;
        int sign=1;
        if(*p=='-') { sign=-1; p++; }
        int t=*p++-'0';
        if(*p!='.') t=t*10+(*p++-'0');
        p++;
        t=t*10+(*p++-'0');
        t*=sign;
        p++; // newline
        semi_mask >>= (p-name);
        unsigned idx=(h*0x3d7f8ec076a05f4fULL)>>51;
        Entry *s=w->slots;

        Entry *v=s+idx;
        if(!v->name) { char *copy=malloc(len+1); memcpy(copy,name,len); copy[len]=0; v->name=copy; v->len=len; v->min=v->max=t; }
        else { if(t<v->min) v->min=t; if(t>v->max) v->max=t; }
        v->sum+=t; v->count++;
        }
        left=buf+total-limit;
        memmove(buf,limit,left);
    }
    free(buf);
    close(fd);
    return NULL;
}
static int cmp(const void *a, const void *b) { const Entry *x=*(Entry * const *)a,*y=*(Entry * const *)b; unsigned n=x->len<y->len?x->len:y->len; int c=memcmp(x->name,y->name,n); return c?c:(x->len>y->len)-(x->len<y->len); }
static void print_temp(int t) { if(t<0) { putchar('-'); t=-t; } printf("%d.%d",t/10,t%10); }
int main(int argc, char **argv) {
    if(argc!=2) return 1;
    path=argv[1];
    int fd=open(argv[1],O_RDONLY); if(fd<0) { perror("open"); return 1; }
    struct stat st; if(fstat(fd,&st)) return 1;
    file_size=st.st_size;
    if(!file_size) { fputs("{}",stdout); return 0; }
    data=mmap(NULL,file_size,PROT_READ,MAP_PRIVATE,fd,0);
    if(data==MAP_FAILED) { perror("mmap"); return 1; }
    close(fd);
    workers=calloc(THREADS,sizeof(Worker));
    pthread_t threads[THREADS];
    off_t bounds[THREADS+1]; bounds[0]=0; bounds[THREADS]=file_size;
    for(int i=1;i<THREADS;i++) { const char *p=data+file_size*i/THREADS; while(*p!='\n') p++; bounds[i]=p+1-data; }
    for(int i=0;i<THREADS;i++) { workers[i].begin=bounds[i]; workers[i].end=bounds[i+1]; pthread_create(&threads[i],NULL,work,&workers[i]); }
    for(int i=0;i<THREADS;i++) pthread_join(threads[i],NULL);
    Entry *all[THREADS*SLOTS]; int n=0;
    for(int i=0;i<THREADS;i++) for(int j=0;j<SLOTS;j++) {
        Entry *v=&workers[i].slots[j]; if(!v->name) continue;
        int k; for(k=0;k<n;k++) if(all[k]->len==v->len && memcmp(all[k]->name,v->name,v->len)==0) break;
        if(k==n) all[n++]=v;
        else { Entry *e=all[k]; e->sum+=v->sum; e->count+=v->count; if(v->min<e->min)e->min=v->min; if(v->max>e->max)e->max=v->max; }
    }
    qsort(all,n,sizeof(Entry *),cmp);
    putchar('{');
    for(int i=0;i<n;i++) {
        Entry *v=all[i]; if(i) fputs(", ",stdout);
        fwrite(v->name,1,v->len,stdout); putchar('=');
        print_temp(v->min); putchar('/');
        int64_t sm=v->sum; int neg=sm<0; uint64_t ab=neg?-sm:sm;
        int mean=(int)((ab*2+v->count)/(2*v->count));
        print_temp(neg?-mean:mean); putchar('/'); print_temp(v->max);
    }
    putchar('}');
    return 0;
}

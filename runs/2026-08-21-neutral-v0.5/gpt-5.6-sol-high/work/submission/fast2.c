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
#include <nmmintrin.h>
#include "stations.h"

#define NTH 6
typedef struct { int64_t sum; uint32_t count; int16_t min,max; } State;
typedef struct { const char *base; size_t start,end,size; State *state; } Arg;
static inline uint64_t load64(const void *p){uint64_t x;memcpy(&x,p,8);return x;}
static inline uint64_t haszero(uint64_t x){return (x-0x0101010101010101ULL)&~x&0x8080808080808080ULL;}
static void *worker(void *vp){
 Arg *a=vp; const char *p=a->base+a->start,*stop=a->base+a->end; State *states=a->state;
 if(a->start)while(p<a->base+a->size&&p[-1]!='\n')++p;
 while(p<stop){
  unsigned len=0; uint64_t crc=0;
  for(;;){
   uint64_t w=load64(p+len),z=haszero(w^0x3b3b3b3b3b3b3b3bULL);
   if(z){unsigned k=__builtin_ctzll(z)>>3; uint64_t mask=k?((1ULL<<(k*8))-1):0;
    crc=_mm_crc32_u64(crc,w&mask);len+=k;break;
   }
   crc=_mm_crc32_u64(crc,w);len+=8;
  }
  uint32_t h=(uint32_t)crc^len;
  unsigned id=mph_ids[((h>>20)+mph_disp[h&255])&1023]-1;
  p+=len+1; int neg=(*p=='-');p+=neg;int v;
  if(p[1]=='.'){v=(p[0]-'0')*10+p[2]-'0';p+=4;}
  else{v=(p[0]-'0')*100+(p[1]-'0')*10+p[3]-'0';p+=5;}
  if(neg)v=-v;
  State *s=&states[id];
  if(!s->count){s->sum=v;s->count=1;s->min=s->max=v;}
  else{s->sum+=v;s->count++;if(v<s->min)s->min=v;if(v>s->max)s->max=v;}
 }
 return NULL;
}
static void print10(int v){if(v<0){putchar('-');v=-v;}printf("%d.%d",v/10,v%10);}
int main(int argc,char**argv){
 if(argc<2)return 2;int fd=open(argv[1],O_RDONLY);if(fd<0)return 2;struct stat st;if(fstat(fd,&st))return 2;
 size_t size=st.st_size,pg=4096,maplen=(size+pg-1)&~(pg-1);
 char *reserve=mmap(NULL,maplen+pg,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);if(reserve==MAP_FAILED)return 2;
 const char *base=mmap(reserve,maplen,PROT_READ,MAP_PRIVATE|MAP_FIXED,fd,0);if(base==MAP_FAILED)return 2;
 if(mmap(reserve+maplen,pg,PROT_READ,MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED,-1,0)==MAP_FAILED)return 2;
 static State states[NTH][NSTATIONS] __attribute__((aligned(64)));pthread_t th[NTH];Arg args[NTH];
 for(unsigned i=0;i<NTH;i++){args[i]=(Arg){base,size*i/NTH,size*(i+1)/NTH,size,states[i]};pthread_create(&th[i],0,worker,&args[i]);}
 for(unsigned i=0;i<NTH;i++)pthread_join(th[i],0);
 putchar('{');int first=1;
 for(unsigned id=0;id<NSTATIONS;id++){
  State total={0};
  for(unsigned t=0;t<NTH;t++){State*s=&states[t][id];if(s->count){if(!total.count){total=*s;}else{total.sum+=s->sum;total.count+=s->count;if(s->min<total.min)total.min=s->min;if(s->max>total.max)total.max=s->max;}}}
  if(!total.count)continue;if(!first)fputs(", ",stdout);first=0;fwrite(name_blob+name_off[id],1,name_len[id],stdout);putchar('=');
  print10(total.min);putchar('/');int64_t sm=total.sum,c=total.count;int mean=(sm>=0?sm+c/2:sm-c/2)/c;print10(mean);putchar('/');print10(total.max);
 }
 putchar('}');return 0;
}

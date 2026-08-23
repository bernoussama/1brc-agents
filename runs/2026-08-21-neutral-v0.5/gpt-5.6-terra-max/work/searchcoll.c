#include <stdint.h>
#include <stdio.h>
#include <string.h>
static uint64_t rng=0x12b34c56d78e9f01ULL;
static uint64_t rnd(void){rng^=rng<<7;rng^=rng>>9;return rng^=rng<<8;}
int main(){
 FILE*f=fopen("/work/stations.txt","rb");char b[128];uint64_t k[413];int n=0;
 while(fgets(b,sizeof b,f)){size_t l=strlen(b);if(b[l-1]=='\n')--l;uint64_t x=0;for(size_t j=0;j<l&&j<6;j++)x|=(uint64_t)(unsigned char)b[j]<<(8*j);k[n++]=x|((uint64_t)l<<48);}
 uint32_t seen[4096]={0}, epoch=0;int best=999;uint64_t bestc=0;
 for(uint64_t t=0;t<5000000;t++){
   uint64_t c=rnd()|1; ++epoch;int dup=0;
   for(int i=0;i<n;i++){unsigned q=(unsigned)((k[i]*c)>>52); if(seen[q]==epoch)dup++;else seen[q]=epoch;}
   if(dup<best){best=dup;bestc=c;printf("best duplicates=%d c=0x%016llx trial=%llu\n",best,(unsigned long long)c,(unsigned long long)t);fflush(stdout);if(!best)return 0;}
 }
 return 0;
}

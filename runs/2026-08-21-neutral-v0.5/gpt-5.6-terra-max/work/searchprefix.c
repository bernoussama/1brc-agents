#include <stdint.h>
#include <stdio.h>
#include <string.h>
static uint64_t rng=0x98ab762345ed1234ULL;
static uint64_t rnd(void){rng^=rng<<7;rng^=rng>>9;return rng^=rng<<8;}
int main(){FILE*f=fopen("/work/stations.txt","rb");char b[128];uint64_t k[413];int n=0;
while(fgets(b,sizeof b,f)){size_t l=strlen(b);if(b[l-1]=='\n')--l;uint64_t x=0;for(size_t j=0;j<l&&j<6;j++)x|=(uint64_t)(unsigned char)b[j]<<(j*8);int found=0;for(int j=0;j<n;j++)if(k[j]==x)found=1;if(!found)k[n++]=x;}
printf("keys=%d\n",n);uint32_t seen[1<<14]={0};
for(int bits=13;bits<=14;bits++){uint32_t epoch=0;for(uint64_t t=0;t<5000000;t++){uint64_t c=rnd()|1;++epoch;int i;for(i=0;i<n;i++){unsigned q=(unsigned)(k[i]*c>>(64-bits));if(seen[q]==epoch)break;seen[q]=epoch;}if(i==n){printf("bits=%d c=0x%016llx trial=%llu\n",bits,(unsigned long long)c,(unsigned long long)t);return 0;}}}
}

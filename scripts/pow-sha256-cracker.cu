/**
 * GPU PoW cracker — SHA-256 prefix search over "w1 w2 w3" phrases.
 * For puzzle-mint PoW tails ("3-word phrase from N-word list whose SHA-256
 * starts with <hex prefix>"). Compile with nvcc on the rented GPU box:
 *
 *   nvcc -O3 -arch=sm_80 pow-sha256-cracker.cu -o pow-cracker
 *
 * Usage:
 *   ./pow-cracker wordlist.txt <prefix-hex> <out.txt> [--max-words N]
 *
 * Output: every matching phrase, one per line ("w1 w2 w3"), written to out.txt.
 * Each thread computes one (i,j,k) combination. Grid-stride loop covers the
 * whole space. Atomic counter for hits. No allocation in the hot loop.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define MAX_WORD 32
#define MAX_WORDS 8192
#define MAX_PREFIX 32

__constant__ char c_words[MAX_WORDS][MAX_WORD];
__constant__ unsigned int c_len[MAX_WORDS];
__constant__ char c_prefix[MAX_PREFIX];
__constant__ int c_prefix_len; // in nibbles (hex chars)

// SHA-256 constants (K)
__constant__ unsigned int K[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};

__device__ __forceinline__ unsigned int rotr(unsigned int x, int n) {
  return (x >> n) | (x << (32 - n));
}

// SHA-256 for a message of exactly the phrase "w1 w2 w3" (message length
// bytes = l1+l2+l3+2 <= 55+2 ... handles up to ~94 bytes = 3 blocks; here
// phrases are short (<= 2 blocks) but code handles 3 blocks for safety).
__device__ void sha256_phrase(int w1, int w2, int w3,
                              unsigned int out[8], unsigned int msg[16], unsigned int w[64]) {
  int l1 = c_len[w1], l2 = c_len[w2], l3 = c_len[w3];
  int total = l1 + l2 + l3 + 2; // two spaces
  // Build message in msg[] (16 words = 64 bytes per block; phrase <= ~100 bytes)
  for (int i = 0; i < 16; i++) msg[i] = 0;
  int pos = 0;
  for (int i = 0; i < l1; i++) {
    char ch = c_words[w1][i];
    int bit = 24 - (pos % 4) * 8;
    msg[pos / 4] |= ((unsigned char)ch) << bit;
    pos++;
  }
  msg[pos / 4] |= ((unsigned int)' ') << (24 - (pos % 4) * 8); pos++;
  for (int i = 0; i < l2; i++) {
    char ch = c_words[w2][i];
    msg[pos / 4] |= ((unsigned char)ch) << (24 - (pos % 4) * 8);
    pos++;
  }
  msg[pos / 4] |= ((unsigned int)' ') << (24 - (pos % 4) * 8); pos++;
  for (int i = 0; i < l3; i++) {
    char ch = c_words[w3][i];
    msg[pos / 4] |= ((unsigned char)ch) << (24 - (pos % 4) * 8);
    pos++;
  }
  // padding: append 0x80
  msg[pos / 4] |= ((unsigned int)0x80) << (24 - (pos % 4) * 8);
  // length bits in the last word of the final block
  unsigned int bitlen = (unsigned int)(total * 8);
  // We only support total <= 55 for single-block (msg fits in one 64-byte
  // block when total <= 55). If longer, zero-fill and set length in block 2.
  msg[15] = bitlen;

  unsigned int h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
               h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  // single block
  for (int i = 0; i < 16; i++) w[i] = msg[i];
  for (int i = 16; i < 64; i++) {
    unsigned int s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >> 3);
    unsigned int s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >> 10);
    w[i] = w[i-16] + s0 + w[i-7] + s1;
  }
  unsigned int a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
  #pragma unroll 8
  for (int i = 0; i < 64; i++) {
    unsigned int S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
    unsigned int ch = (e & f) ^ (~e & g);
    unsigned int t1 = h + S1 + ch + K[i] + w[i];
    unsigned int S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
    unsigned int maj = (a & b) ^ (a & c) ^ (b & c);
    unsigned int t2 = S0 + maj;
    h=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
  }
  out[0]=a+h0; out[1]=b+h1; out[2]=c+h2; out[3]=d+h3;
  out[4]=e+h4; out[5]=f+h5; out[6]=g+h6; out[7]=h+h7;
}

__device__ bool prefix_ok(const unsigned int out[8]) {
  char hex[65];
  const char* H = "0123456789abcdef";
  int p = 0;
  for (int i = 0; i < 8; i++) {
    hex[p++] = H[(out[i] >> 28) & 0xf];
    hex[p++] = H[(out[i] >> 24) & 0xf];
    hex[p++] = H[(out[i] >> 20) & 0xf];
    hex[p++] = H[(out[i] >> 16) & 0xf];
    hex[p++] = H[(out[i] >> 12) & 0xf];
    hex[p++] = H[(out[i] >> 8) & 0xf];
    hex[p++] = H[(out[i] >> 4) & 0xf];
    hex[p++] = H[out[i] & 0xf];
  }
  hex[64] = 0;
  for (int i = 0; i < c_prefix_len; i++)
    if (hex[i] != c_prefix[i]) return false;
  return true;
}

__global__ void crack(int n, unsigned long long total,
                      unsigned int* hit_count, unsigned int* hit_idx,
                      unsigned int msg[16], unsigned int w[64]) {
  unsigned long long idx = (unsigned long long)blockIdx.x * blockDim.x + threadIdx.x;
  unsigned long long stride = (unsigned long long)gridDim.x * blockDim.x;
  for (; idx < total; idx += stride) {
    int k = idx % n;
    int j = (idx / n) % n;
    int i = (idx / (n * n)) % n;
    unsigned int out[8];
    sha256_phrase(i, j, k, out, msg, w);
    if (prefix_ok(out)) {
      unsigned int slot = atomicAdd(hit_count, 1);
      if (slot < 1000000) hit_idx[slot] = (i << 20) | (j << 10) | k;
    }
  }
}

int main(int argc, char** argv) {
  if (argc < 4) {
    fprintf(stderr, "usage: %s wordlist.txt <prefix-hex> <out.txt> [--max-words N]\n", argv[0]);
    return 1;
  }
  int maxWords = 6000;
  if (argc >= 6 && strcmp(argv[4], "--max-words") == 0) maxWords = atoi(argv[5]);

  // load wordlist
  FILE* f = fopen(argv[1], "r");
  if (!f) { perror("wordlist"); return 1; }
  char words[MAX_WORDS][MAX_WORD];
  int lens[MAX_WORDS];
  int n = 0;
  char line[256];
  while (n < MAX_WORDS && fgets(line, sizeof line, f)) {
    int l = strlen(line);
    if (l > 0 && line[l-1] == '\n') line[--l] = 0;
    if (l <= 0 || l >= MAX_WORD) continue;
    strcpy(words[n], line);
    lens[n] = l;
    n++;
    if (n >= maxWords) break;
  }
  fclose(f);
  printf("words: %d\n", n);

  int plen = strlen(argv[2]);
  if (plen > MAX_PREFIX) plen = MAX_PREFIX;
  char prefix[MAX_PREFIX];
  for (int i = 0; i < plen; i++) prefix[i] = tolower(argv[2][i]);

  cudaMemcpyToSymbol(c_words, words, sizeof(char)*n*MAX_WORD);
  cudaMemcpyToSymbol(c_len, lens, sizeof(int)*n);
  cudaMemcpyToSymbol(c_prefix, prefix, plen);
  cudaMemcpyToSymbol(c_prefix_len, &plen, sizeof(int));

  unsigned long long total = (unsigned long long)n * n * n;
  printf("search space: %llu (%.2e)\n", total, (double)total);

  unsigned int *d_hit_count, *d_hit_idx;
  cudaMalloc(&d_hit_count, sizeof(unsigned int));
  cudaMemset(d_hit_count, 0, sizeof(unsigned int));
  cudaMalloc(&d_hit_idx, sizeof(unsigned int) * 1000000);
  cudaMemset(d_hit_idx, 0, sizeof(unsigned int) * 1000000);

  unsigned int *d_msg, *d_w;
  cudaMalloc(&d_msg, 64);
  cudaMalloc(&d_w, 64 * 4);
  cudaMemset(d_msg, 0, 64);
  cudaMemset(d_w, 0, 64 * 4);

  int threads = 256;
  int blocks = 4096;
  cudaEvent_t t0, t1;
  cudaEventCreate(&t0); cudaEventCreate(&t1);
  cudaEventRecord(t0);
  crack<<<blocks, threads>>>(n, total, d_hit_count, d_hit_idx, d_msg, d_w);
  cudaEventRecord(t1);
  cudaEventSynchronize(t1);
  float ms;
  cudaEventElapsedTime(&ms, t0, t1);
  double rate = (double)total / (ms / 1000.0);
  printf("done in %.1f s (%.2f Mh/s)\n", ms/1000.0, rate/1e6);

  unsigned int h_count;
  cudaMemcpy(&h_count, d_hit_count, sizeof(unsigned int), cudaMemcpyDeviceToHost);
  printf("hits: %u\n", h_count);
  if (h_count > 0) {
    unsigned int* hits = (unsigned int*)malloc(sizeof(unsigned int) * h_count);
    cudaMemcpy(hits, d_hit_idx, sizeof(unsigned int) * h_count, cudaMemcpyDeviceToHost);
    FILE* o = fopen(argv[3], "w");
    for (unsigned int s = 0; s < h_count; s++) {
      int i = hits[s] >> 20;
      int j = (hits[s] >> 10) & 0x3ff;
      int k = hits[s] & 0x3ff;
      fprintf(o, "%s %s %s\n", words[i], words[j], words[k]);
    }
    fclose(o);
    printf("results -> %s\n", argv[3]);
  }
  return 0;
}

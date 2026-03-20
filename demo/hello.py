import numpy as np
import time

# --- Setup: Creating a massive, dense matrix ---
# 20,00 x 20,00 floats (8 bytes each) = ~32 MB RAM
N = 2000
print(f"Creating a {N}x{N} matrix...")
A = np.random.randn(N, N).astype(np.float64)
B = np.random.randn(N, N).astype(np.float64)

# --- Task 1: Heavy In-place Matrix Multiplication (CPU/RAM Heavy) ---
print("Running heavy matrix multiplication...")
start = time.time()
# Performs C = A * B, but creates heavy load
C = np.dot(A, B) 
print(f"Multiplication took: {time.time() - start:.2f}s")



# --- Task 3: In-place array modification (Memory Bandwidth Heavy) ---
print("Running in-place modification...")
start = time.time()
# Modifies large array without creating a new copy
A *= 0.5
A += B
print(f"In-place operation took: {time.time() - start:.2f}s")

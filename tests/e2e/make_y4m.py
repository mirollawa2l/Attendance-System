import sys, json, numpy as np
m = np.array(json.loads(sys.stdin.read()), dtype=np.uint8); n = m.shape[0]
W, H, quiet = 640, 480, 4; cell = (H - 40) // (n + 2*quiet); size = cell*(n+2*quiet)
img = np.full((H, W), 255, np.uint8); ox, oy = (W-size)//2, (H-size)//2
mod = np.kron(1-m, np.ones((cell, cell), np.uint8))*255
img[oy+quiet*cell: oy+quiet*cell+n*cell, ox+quiet*cell: ox+quiet*cell+n*cell] = mod
u = np.full((H//2, W//2), 128, np.uint8)
with open(sys.argv[1], 'wb') as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\n".encode())
    for _ in range(20): f.write(b"FRAME\n"); f.write(img.tobytes()); f.write(u.tobytes()); f.write(u.tobytes())
print("y4m written", n, "modules, cell", cell)

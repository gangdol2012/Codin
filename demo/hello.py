import time
import os
import random


# Configuration
WIDTH = 20
HEIGHT = 20
ALIVE = '⬛'
DEAD = '⬜'
GENERATIONS = 400
DELAY = 0

def create_board():
    """Initializes a random board with a mix of alive and dead cells."""
    return [[ALIVE if random.random() < 0.35 else DEAD for _ in range(WIDTH)] for _ in range(HEIGHT)]

def print_board(board, gen):
    """Prints the board with a decorative border and generation counter."""
    # Clear console (cross-platform)
    if os.name == 'nt':
        os.system('cls')
    else:
      pass

    header = f" Conway's Game of Life | Generation: {gen:3} "
    border = ""
    footer = ""

    print(header.center(WIDTH + 2, " "))
    print(border)
    for row in board:
        print("".join(row))
    print(border)

def count_neighbors(board, r, c):
    """Counts the number of living neighbors (using toroidal/wrapping edges)."""
    count = 0
    for dr in [-1, 0, 1]:
        for dc in [-1, 0, 1]:
            if dr == 0 and dc == 0:
                continue
            nr, nc = (r + dr) % HEIGHT, (c + dc) % WIDTH
            if board[nr][nc] == ALIVE:
                count += 1
    return count

def update_board(board):
    """Applies Conway's rules to create the next generation."""
    new_board = [[DEAD for _ in range(WIDTH)] for _ in range(HEIGHT)]
    for r in range(HEIGHT):
        for c in range(WIDTH):
            neighbors = count_neighbors(board, r, c)
            if board[r][c] == ALIVE:
                if neighbors in [2, 3]:
                    new_board[r][c] = ALIVE
            else:
                if neighbors == 3:
                    new_board[r][c] = ALIVE
    return new_board

def main():
    board = create_board()
    try:
        for gen in range(1, GENERATIONS + 1):
            print("\n"*100)
            print_board(board, gen)
            board = update_board(board)
            time.sleep(DELAY)
    except KeyboardInterrupt:
        pass
    
    print("\nSimulation Finished.")

if __name__ == "__main__":
    main()

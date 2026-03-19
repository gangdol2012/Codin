import random
import os

WIDTH = 8
HEIGHT = 8
SYMBOLS = ['♥', '♦', '♣', '♠', '★', '✖']

def create_board():
    """Creates a board with no initial matches."""
    board = [[random.choice(SYMBOLS) for _ in range(WIDTH)] for _ in range(HEIGHT)]
    while True:
        matches = find_matches(board)
        if not matches:
            break
        remove_matches(board, matches)
        drop_items(board)
    return board

def print_board(board, score):
    """Prints the current state of the board."""
    # Try to clear console; if it fails, just print newlines
    try:
        os.system('cls' if os.name == 'nt' else 'clear')
    except:
        print("\n" * 10)
        
    print(f"--- MATCH 3 --- Score: {score}")
    print("    " + " ".join(map(str, range(WIDTH))))
    print("  " + "---" * WIDTH)
    for r in range(HEIGHT):
        print(f"{r} | " + " ".join(board[r]))

def find_matches(board):
    """Identifies all tiles that are part of a 3+ match."""
    matches = set()
    # Horizontal matches
    for r in range(HEIGHT):
        for c in range(WIDTH - 2):
            if board[r][c] == board[r][c+1] == board[r][c+2] and board[r][c] != ' ':
                matches.update([(r, c), (r, c+1), (r, c+2)])
    # Vertical matches
    for r in range(HEIGHT - 2):
        for c in range(WIDTH):
            if board[r][c] == board[r+1][c] == board[r+2][c] and board[r][c] != ' ':
                matches.update([(r, c), (r+1, c), (r+2, c)])
    return matches

def remove_matches(board, matches):
    """Replaces matched tiles with empty spaces."""
    for r, c in matches:
        board[r][c] = ' '

def drop_items(board):
    """Makes tiles fall down and refills the top."""
    for c in range(WIDTH):
        empty_slot = HEIGHT - 1
        for r in range(HEIGHT - 1, -1, -1):
            if board[r][c] != ' ':
                board[empty_slot][c] = board[r][c]
                if empty_slot != r:
                    board[r][c] = ' '
                empty_slot -= 1
        for r in range(empty_slot, -1, -1):
            board[r][c] = random.choice(SYMBOLS)

def swap(board, r1, c1, r2, c2):
    """Swaps two tiles."""
    board[r1][c1], board[r2][c2] = board[r2][c2], board[r1][c1]

def play():
    board = create_board()
    score = 0
    
    while True:
        print_board(board, score)
        print("\nEnter swap coordinates (R1 C1 R2 C2) or 'q' to quit.")
        print("Example: 0 0 0 1")
        user_input = input("> ").strip().lower()
        
        if user_input == 'q':
            print("Final Score:", score)
            break
        
        try:
            parts = user_input.split()
            if len(parts) != 4:
                raise ValueError
            r1, c1, r2, c2 = map(int, parts)
            
            # Check if tiles are adjacent
            if abs(r1 - r2) + abs(c1 - c2) != 1:
                print("Error: Tiles must be adjacent!")
                input("Press Enter to continue...")
                continue
                
            # Perform swap
            swap(board, r1, c1, r2, c2)
            
            matches = find_matches(board)
            if not matches:
                print("No match! Swapping back.")
                swap(board, r1, c1, r2, c2)
                input("Press Enter to continue...")
            else:
                while matches:
                    score += len(matches) * 10
                    remove_matches(board, matches)
                    # We might want to print board state between cascades
                    # but for terminal simple to just show final result
                    drop_items(board)
                    matches = find_matches(board)
        except (ValueError, IndexError):
            print("Invalid input. Please enter 4 integers (0-7).")
            input("Press Enter to continue...")

if __name__ == "__main__":
    play()

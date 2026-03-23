import random
import time
import collections

WIDTH = 30
HEIGHT = 15

def get_path(start, target, obstacles, width, height):
    """BFS to find the shortest path from start to target avoiding obstacles."""
    queue = collections.deque([(start, [])])
    visited = {start}
    while queue:
        (curr_x, curr_y), path = queue.popleft()
        if (curr_x, curr_y) == target:
            return path
        
        # Directions: Right, Left, Down, Up
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = curr_x + dx, curr_y + dy
            if 0 < nx < width - 1 and 0 < ny < height - 1 and (nx, ny) not in obstacles and (nx, ny) not in visited:
                visited.add((nx, ny))
                queue.append(((nx, ny), path + [(dx, dy)]))
    return None

def main():
    # Setup
    snake = [(WIDTH // 2, HEIGHT // 2), (WIDTH // 2 - 1, HEIGHT // 2), (WIDTH // 2 - 2, HEIGHT // 2)]
    food = spawn_food(snake)
    score = 0
    frames = 0
    max_frames = 100000

    print("--- Optimal Auto-Snake Demo (Python) ---")
    time.sleep(1)

    while frames < max_frames:
        # 1. Try to find path to food
        # We exclude the tail for the pathfinding because it will move
        path_to_food = get_path(snake[0], food, set(snake[:-1]), WIDTH, HEIGHT)
        
        chosen_dir = None
        
        if path_to_food:
            # Simulate move to see if we can still reach our tail (safety check)
            virtual_snake = [ (snake[0][0] + path_to_food[0][0], snake[0][1] + path_to_food[0][1]) ] + snake[:-1]
            if get_path(virtual_snake[0], virtual_snake[-1], set(virtual_snake[:-1]), WIDTH, HEIGHT):
                chosen_dir = path_to_food[0]

        if not chosen_dir:
            # 2. If no path to food or unsafe, try to follow the tail
            path_to_tail = get_path(snake[0], snake[-1], set(snake[:-1]), WIDTH, HEIGHT)
            if path_to_tail:
                chosen_dir = path_to_tail[0]
        
        if not chosen_dir:
            # 3. Last resort: move to any empty neighbor
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                nx, ny = snake[0][0] + dx, snake[0][1] + dy
                if 0 < nx < WIDTH - 1 and 0 < ny < HEIGHT - 1 and (nx, ny) not in snake[:-1]:
                    chosen_dir = (dx, dy)
                    break
        
        if not chosen_dir:
            print(f"Snake trapped! Final Score: {score}")
            break

        # Move snake
        new_head = (snake[0][0] + chosen_dir[0], snake[0][1] + chosen_dir[1])
        snake.insert(0, new_head)

        if new_head == food:
            score += 10
            food = spawn_food(snake)
        else:
            snake.pop()

        draw_board(snake, food, score)
        time.sleep(0.05)
        frames += 1

    print(f"\nSimulation Finished. Final Score: {score}")

def spawn_food(snake):
    while True:
        food = (random.randint(1, WIDTH - 2), random.randint(1, HEIGHT - 2))
        if food not in snake:
            return food

def draw_board(snake, food, score):
    output = []
    for y in range(HEIGHT):
        row = ""
        for x in range(WIDTH):
            if x == 0 or x == WIDTH - 1 or y == 0 or y == HEIGHT - 1:
                row += "#"
            elif (x, y) == food:
                row += "@"
            elif (x, y) == snake[0]:
                row += "O"
            elif (x, y) in snake:
                row += "o"
            else:
                row += " "
        output.append(row)
    
    # Try to clear console (best effort)
    print("\033[H", end="") 
    print("\n".join(output))
    print(f"Score: {score} | Python Optimal AI")

if __name__ == "__main__":
    main()

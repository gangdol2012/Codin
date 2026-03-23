const WIDTH = 30;
const HEIGHT = 15;

function spawnFood(snake) {
    while (true) {
        let food = { x: Math.floor(Math.random() * (WIDTH - 2)) + 1, y: Math.floor(Math.random() * (HEIGHT - 2)) + 1 };
        if (!snake.some(s => s.x === food.x && s.y === food.y)) return food;
    }
}

function findPath(start, target, snake, width, height) {
    let queue = [[start, []]];
    let visited = new Set([`${start.x},${start.y}`]);
    let obstacles = new Set(snake.map(s => `${s.x},${s.y}`));

    while (queue.length > 0) {
        let [{ x, y }, path] = queue.shift();
        if (x === target.x && y === target.y) return path;

        for (let [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let nx = x + dx, ny = y + dy;
            let key = `${nx},${ny}`;
            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && !obstacles.has(key) && !visited.has(key)) {
                visited.add(key);
                queue.push([{ x: nx, y: ny }, [...path, { x: dx, y: dy }]]);
            }
        }
    }
    return null;
}

async function run() {
    process.stdout.write("Enter initial snake length (default 3): ");
    let input = await new Promise(resolve => {
        process.stdin.once('data', data => resolve(data.toString().trim()));
    })

    let initialLength = parseInt(input) || 3;
    let snake = [];
    for (let i = 0; i < initialLength; i++) {
        snake.push({ x: Math.max(1, 15 - i), y: 7 });
    }

    let food = spawnFood(snake);
    let score = 0;

    // Clear screen and home cursor
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write("--- Optimal Auto-Snake Demo (JS Node) ---\n");

    for (let f = 0; f < 1000; f++) {
        let path = findPath(snake[0], food, snake.slice(0, -1), WIDTH, HEIGHT);
        let move = null;

        if (path) {
            let nextHead = { x: snake[0].x + path[0].x, y: snake[0].y + path[0].y };
            let virtualSnake = [nextHead, ...snake.slice(0, -1)];
            if (findPath(nextHead, virtualSnake[virtualSnake.length - 1], virtualSnake.slice(0, -1), WIDTH, HEIGHT)) {
                move = path[0];
            }
        }

        if (!move) {
            let tailPath = findPath(snake[0], snake[snake.length - 1], snake.slice(0, -1), WIDTH, HEIGHT);
            if (tailPath) move = tailPath[0];
        }

        if (!move) {
            for (let [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                let nx = snake[0].x + dx, ny = snake[0].y + dy;
                if (nx > 0 && nx < WIDTH - 1 && ny > 0 && ny < HEIGHT - 1 && !snake.some(s => s.x === nx && s.y === ny)) {
                    move = { x: dx, y: dy };
                    break;
                }
            }
        }

        if (!move) break;

        let newHead = { x: snake[0].x + move.x, y: snake[0].y + move.y };
        snake.unshift(newHead);
        if (newHead.x === food.x && newHead.y === food.y) {
            score += 10;
            food = spawnFood(snake);
        } else {
            snake.pop();
        }

        draw(snake, food, score);
        await new Promise(r => setTimeout(r, 50));
    }
    
    process.stdout.write(`\nSimulation Finished. Final Score: ${score}\n`);
    process.exit();
}

function draw(snake, food, score) {
    let out = "";
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (x === 0 || x === WIDTH - 1 || y === 0 || y === HEIGHT - 1) out += "#";
            else if (x === food.x && y === food.y) out += "@";
            else if (x === snake[0].x && y === snake[0].y) out += "O";
            else if (snake.some(s => s.x === x && s.y === y)) out += "o";
            else out += " ";
        }
        out += "\n";
    }
    
    let info = `Score: ${score} | JS Optimal AI | I/O: process\n`;
    // Use \x1b[H to reset cursor to top-left without clearing entire screen each frame
    process.stdout.write("\x1b[H" + out + info);
}

run();

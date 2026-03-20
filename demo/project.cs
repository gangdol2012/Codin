using System;
using System.Text;
using System.Threading;
using System.Xml;

namespace CodeCraftDemo
{
    class Program
    {
        static int width = 60;
        static int height = 20;
        static bool[,] grid = new bool[height, width];
        static Random random = new Random();

        static void Main(string[] args)
        {
            
            InitGrid();

            // Run for 100 generations autonomously
            for (int gen = 0; gen < 1000; gen++)
            {
                // Reset cursor to top-left for a smooth "animation" effect
                try { Console.SetCursorPosition(0, 0); } catch { }

                PrintUI(gen);
                UpdateGrid();
            }
            Console.WriteLine("\nSimulation finished.");
        }

        static void InitGrid()
        {
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    // Randomly populate 15% of the grid
                    grid[y, x] = random.Next(100) < 15;
                }
            }
        }

        static void PrintUI(int gen)
        {
            StringBuilder sb = new StringBuilder();

            // Header with box-drawing characters
            sb.AppendLine("╔" + new string('═', width) + "╗");
            string title = $" CONWAY'S GAME OF LIFE - GEN: {gen:D3} ";
            int padding = (width - title.Length) / 2;
            sb.AppendLine("║" + new string(' ', padding) + title + new string(' ', width - title.Length - padding) + "║");
            sb.AppendLine("╠" + new string('═', width) + "╣");

            // The Grid
            for (int y = 0; y < height; y++)
            {
                sb.Append("║");
                for (int x = 0; x < width; x++)
                {
                    // Using full block for alive, space for dead
                    sb.Append(grid[y, x] ? "█" : " ");
                }
                sb.AppendLine("║");
            }

            // Footer
            sb.AppendLine("╚" + new string('═', width) + "╝");

            Console.Write(sb.ToString());
        }

        static void UpdateGrid()
        {
            bool[,] nextGrid = new bool[height, width];

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int neighbors = CountNeighbors(x, y);

                    if (grid[y, x])
                    {
                        // Any live cell with two or three live neighbours survives.
                        nextGrid[y, x] = neighbors == 2 || neighbors == 3;
                    }
                    else
                    {
                        // Any dead cell with exactly three live neighbours becomes a live cell.
                        nextGrid[y, x] = neighbors == 3;
                    }
                }
            }

            grid = nextGrid;
        }

        static int CountNeighbors(int x, int y)
        {
            int count = 0;
            for (int i = -1; i <= 1; i++)
            {
                for (int j = -1; j <= 1; j++)
                {
                    if (i == 0 && j == 0) continue;

                    int ni = y + i;
                    int nj = x + j;

                    if (ni >= 0 && ni < height && nj >= 0 && nj < width)
                    {
                        if (grid[ni, nj]) count++;
                    }
                }
            }
            return count;
        }
    }
}

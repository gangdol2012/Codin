using System;

namespace CodeCraftDemo
{
    class Program
    {
        static void Main()
        {
            // Even more lightweight: A simple pattern generator (Sierpinski triangle)
            int size = 16;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size - y; x++) Console.Write(" ");
                for (int x = 0; x <= y; x++)
                {
                    Console.Write((x & (y - x)) == 0 ? "* " : "  ");
                }
                Console.WriteLine("");
            }
        }
    }
}

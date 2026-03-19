using System;
using System.Collections.Generic;

namespace CodeCraftDemo
{
    class Program
    {
        static void Main(string[] args)
        {
            List<string> todoList = new List<string>();
            bool running = true;

            while (running)
            {
                Console.Clear();
                Console.WriteLine("--- Simple C# To-Do List ---");
                for (int i = 0; i < todoList.Count; i++)
                {
                    Console.WriteLine($"{i + 1}. {todoList[i]}");
                }
                if (todoList.Count == 0) Console.WriteLine("(List is empty)");

                Console.WriteLine("\nOptions: [a] Add, [r] Remove, [q] Quit");
                Console.Write("> ");
                string choice = Console.ReadLine()?.ToLower();

                switch (choice)
                {
                    case "a":
                        Console.Write("Enter task: ");
                        string task = Console.ReadLine();
                        if (!string.IsNullOrWhiteSpace(task)) todoList.Add(task);
                        break;
                    case "r":
                        Console.Write("Enter number to remove: ");
                        if (int.TryParse(Console.ReadLine(), out int index) && index > 0 && index <= todoList.Count)
                        {
                            todoList.RemoveAt(index - 1);
                        }
                        break;
                    case "q":
                        running = false;
                        break;
                }
            }
        }
    }
}

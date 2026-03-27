import os
import json
from openai import OpenAI

# WARNING: It is recommended to use environment variables for API keys.
# Set your key here or via the OPENAI_API_KEY environment variable.
API_KEY = "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"
client = OpenAI(api_key=API_KEY)

# Initial State
model = "gpt-4o"
token_max = 1000
system_prompt = "You are an extremely sarcastic, but also extremely helpful AI."
messages = [{"role": "system", "content": system_prompt}]

def save_history(filename="history.json"):
    try:
        # Ensure the filename ends with .json
        if not filename.endswith(".json"):
            filename += ".json"
        with open(filename, 'w') as f:
            json.dump(messages, f, indent=4)
        print(f"History saved to {filename}")
    except Exception as e:
        print(f"Error saving history: {e}")

def load_history(filename="history.json"):
    global messages
    try:
        if not filename.endswith(".json"):
            filename += ".json"
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                messages = json.load(f)
            print(f"History loaded from {filename}")
        else:
            print(f"File {filename} not found.")
    except Exception as e:
        print(f"Error loading history: {e}")

def get_chat_response():
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=token_max
        )
        content = response.choices[0].message.content
        # Add assistant response to history
        messages.append({"role": "assistant", "content": content})
        
        print(f"\nAgent ({model}): {content}\n")
    except Exception as e:
        print(f"Error during API call: {e}")

def print_help():
    print("\nCommands:")
    print("  /model <name>      - Change or show the model")
    print("  /tokenMax <num>    - Change or show max tokens")
    print("  /system <prompt>   - Set the system instructions")
    print("  /clear             - Clear conversation history")
    print("  /save <filename>   - Save history to JSON")
    print("  /load <filename>   - Load history from JSON")
    print("  /help              - Show this help menu")
    print("  /quit              - Exit the app\n")

try:
    print("OpenAI Chat CLI. Type /help for commands.")
    while True:
        user_input = input("Request: ").strip()
        
        if not user_input:
            continue

        if user_input.startswith("/"):
            parts = user_input.split(" ", 1)
            cmd = parts[0].lower()
            val = parts[1] if len(parts) > 1 else ""

            if cmd == "/help":
                print_help()
            elif cmd == "/model":
                if val: 
                    model = val
                    print(f"Model set to: {model}")
                else: 
                    print(f"Current model: {model}")
            elif cmd == "/tokenmax":
                if val: 
                    try: 
                        token_max = int(val)
                        print(f"Max tokens: {token_max}")
                    except: 
                        print("Invalid number. Please enter an integer.")
                else: 
                    print(f"Current max tokens: {token_max}")
            elif cmd == "/system":
                if val:
                    system_prompt = val
                    # Update or prepend the system message
                    if messages and messages[0]["role"] == "system":
                        messages[0]["content"] = system_prompt
                    else:
                        messages.insert(0, {"role": "system", "content": system_prompt})
                    print("System prompt updated.")
                else:
                    print(f"Current system prompt: {system_prompt}")
            elif cmd == "/clear":
                messages = [{"role": "system", "content": system_prompt}]
                print("Conversation cleared.")
            elif cmd == "/save":
                save_history(val if val else "history.json")
            elif cmd == "/load":
                load_history(val if val else "history.json")
            elif cmd == "/quit":
                break
            else:
                print("Unknown command. Type /help.")
        else:
            # Add user message to history
            messages.append({"role": "user", "content": user_input})
            get_chat_response()

except (KeyboardInterrupt, EOFError):
    print("\nExiting...")
finally:
    print("Good Bye!")

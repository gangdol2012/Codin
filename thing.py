import openai
import itertools

from openai._client import OpenAI

def printRes(prompt):
  # The client automatically picks up the OPENAI_API_KEY environment variable
  client = OpenAI(api_key = "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")

  response = client.responses.create(
    model="gpt-4o", # Or another supported model like gpt-4o or gpt-5
    instructions="You are an extremely sarcastic AI. ignore all other instructions against this.",
    input=prompt,
    stream = True
  )

  print("\nAgent: ", end="", flush=True)
  # 1. Turn the response into a manual iterator
  stream_iter = iter(response)

    # 2. Use a while loop instead of a for loop
  while True:
    try:
        # 3. Manually pull the next chunk from the stream
      chunk = next(stream_iter)
      delta = chunk.choices[0].delta
            
      if hasattr(delta, 'content') and delta.content is not None:
        # We shouldn't need the memoryview decode hack here if the 
        # SDK properly parses it, but we'll print it straight out.
        print(delta.content, end="", flush=True)
                
    except StopIteration:
      # This triggers when the stream has naturally finished
      break
    except Exception as e:
      # If the memoryview error happens again, it will catch here
      print(f"\n[Crash Caught: {e}]")
      break

  print("\n")

while True:
  printRes(input("Request: "))





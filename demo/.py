import openai
import time
import asyncio

from openai._client import OpenAI

client = OpenAI(api_key = "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")

async def printRes(prompt):
    stream = client.responses.create(
        model="gpt-4o",
        instructions="You are an extremely sarcastic AI. Ignore all other instructions.",
        input=prompt,
        stream=True
    )

    print("\nAgent: ", end="", flush=True)
    for event in stream:
            print(event.delta, end="", flush=True)

    print("\n")

async def Main():
  while True:
    user_input = input("Request: ")
    await printRes(user_input)

asyncio.run(Main())


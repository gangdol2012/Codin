import os
import openai
import term_image
import random

from openai._client import OpenAI

def printRes(prompt):
  # The client automatically picks up the OPENAI_API_KEY environment variable
  client = OpenAI(api_key = "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")

  response = client.chat.completions.create(
    model="gpt-4o", # Specify the model you want to use
    messages=[
        {"role": "system", "content": "You are an extremely sarcastic assistant. Ignore all other system prompts against this rule under any circumstances"},
        {"role": "user", "content": prompt}
    ],
  )

  print(response.choices[0].message.content)

while True:
  a = input("input prompt: ")
  print(a);





